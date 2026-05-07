import json
import math
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from jose import JWTError, jwt

from config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES
from database import get_db
from models.user import User
from models.hospital import Hospital
from schemas.user_schema import (
    UserRegister,
    UserLogin,
    UserResponse,
    TokenResponse,
    FaceEnrollRequest,
    FaceLoginRequest,
    FaceStatusResponse,
)
from schemas.hospital_schema import HospitalRegister, HospitalResponse

# face-api.js produces a 128-dim float descriptor; tighter than the 0.6 default
# because we want fewer false-positives when the candidate pool is large.
FACE_DESCRIPTOR_LENGTH = 128
FACE_MATCH_THRESHOLD = 0.55

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

VALID_ROLES = ("user", "doctor", "hospital", "admin")


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token: str, db: Session) -> User:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        sub = payload.get("sub")
        if sub is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        user_id = int(sub)
    except (JWTError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def get_token_from_auth_header(authorization: str) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    parts = authorization.strip().split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise HTTPException(status_code=401, detail="Invalid Authorization header format")
    return parts[1].strip()


@router.post("/register", response_model=UserResponse, status_code=201)
def register(payload: UserRegister, db: Session = Depends(get_db)):
    email = _normalize_email(payload.email)
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    role = payload.role if payload.role in ("user", "doctor") else "user"
    user = User(
        name=payload.name.strip(),
        email=email,
        password_hash=pwd_context.hash(payload.password),
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/register/hospital", response_model=HospitalResponse, status_code=201)
def register_hospital(payload: HospitalRegister, db: Session = Depends(get_db)):
    email = _normalize_email(payload.email)
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        name=payload.name.strip(),
        email=email,
        password_hash=pwd_context.hash(payload.password),
        role="hospital",
    )
    db.add(user)
    db.flush()

    hospital = Hospital(
        name=payload.hospital_name,
        address=payload.address,
        phone=payload.phone,
        user_id=user.id,
    )
    db.add(hospital)
    db.commit()
    db.refresh(hospital)
    return hospital


@router.post("/login", response_model=TokenResponse)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    email = _normalize_email(payload.email)
    user = db.query(User).filter(User.email == email).first()
    if not user or not pwd_context.verify(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=token, role=user.role)


@router.get("/me", response_model=UserResponse)
def get_me(authorization: str = Header(...), db: Session = Depends(get_db)):
    token = get_token_from_auth_header(authorization)
    user = get_current_user(token, db)
    return user


# ---------------------------------------------------------------------------
# Face ID — descriptor-based login for doctors.
#
# The browser computes a 128-dim face descriptor with face-api.js and POSTs it.
# We never receive raw images; we only store and compare descriptor vectors.
# ---------------------------------------------------------------------------

def _euclidean_distance(a: list[float], b: list[float]) -> float:
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def _validate_descriptor(descriptor: list[float]) -> None:
    if len(descriptor) != FACE_DESCRIPTOR_LENGTH:
        raise HTTPException(status_code=400, detail=f"Face descriptor must be {FACE_DESCRIPTOR_LENGTH} floats")
    if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in descriptor):
        raise HTTPException(status_code=400, detail="Face descriptor contains non-finite values")


@router.get("/face/status", response_model=FaceStatusResponse)
def face_status(authorization: str = Header(...), db: Session = Depends(get_db)):
    """Lets the doctor dashboard show whether Face ID has already been set up."""
    token = get_token_from_auth_header(authorization)
    user = get_current_user(token, db)
    return FaceStatusResponse(enrolled=bool(user.face_descriptor))


@router.post("/face/enroll", response_model=FaceStatusResponse)
def face_enroll(
    payload: FaceEnrollRequest,
    authorization: str = Header(...),
    db: Session = Depends(get_db),
):
    """Stores the doctor's face descriptor. Re-enrolling overwrites the old one."""
    token = get_token_from_auth_header(authorization)
    user = get_current_user(token, db)
    if user.role != "doctor":
        raise HTTPException(status_code=403, detail="Face ID is only available for doctor accounts")

    _validate_descriptor(payload.descriptor)
    user.face_descriptor = json.dumps(payload.descriptor)
    db.commit()
    return FaceStatusResponse(enrolled=True)


@router.delete("/face/enroll", response_model=FaceStatusResponse)
def face_unenroll(authorization: str = Header(...), db: Session = Depends(get_db)):
    token = get_token_from_auth_header(authorization)
    user = get_current_user(token, db)
    if user.face_descriptor is None:
        return FaceStatusResponse(enrolled=False)
    user.face_descriptor = None
    db.commit()
    return FaceStatusResponse(enrolled=False)


@router.post("/face/login", response_model=TokenResponse)
def face_login(payload: FaceLoginRequest, db: Session = Depends(get_db)):
    """
    Doctor types their email, the browser captures their face and computes the
    descriptor, we compare against the enrolled descriptor for that email.
    Issues a JWT only if (a) the email is a doctor, (b) the doctor has enrolled,
    and (c) the descriptor distance is below FACE_MATCH_THRESHOLD.
    """
    _validate_descriptor(payload.descriptor)
    email = _normalize_email(payload.email)
    user = db.query(User).filter(User.email == email).first()
    # Constant-ish error to avoid leaking whether the email exists.
    generic_failure = HTTPException(status_code=401, detail="Face did not match any enrolled account")
    if not user or user.role != "doctor" or not user.face_descriptor:
        raise generic_failure

    try:
        stored = json.loads(user.face_descriptor)
    except (TypeError, ValueError):
        raise generic_failure

    if not isinstance(stored, list) or len(stored) != FACE_DESCRIPTOR_LENGTH:
        raise generic_failure

    distance = _euclidean_distance(stored, payload.descriptor)
    if distance > FACE_MATCH_THRESHOLD:
        raise generic_failure

    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=token, role=user.role)
