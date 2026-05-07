from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from models.doctor import Doctor
from models.appointment import Appointment
from models.hospital import Hospital
from routers.auth import get_current_user, get_token_from_auth_header
from schemas.user_schema import UserResponse
from schemas.doctor_schema import DoctorResponse
from schemas.appointment_schema import AppointmentResponse
from schemas.hospital_schema import HospitalResponse
from schemas.admin_schema import AdminStatsResponse

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


def _require_admin(authorization: str, db: Session) -> User:
    token = get_token_from_auth_header(authorization)
    user = get_current_user(token, db)
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


@router.get("/stats", response_model=AdminStatsResponse)
def admin_stats(authorization: str = Header(...), db: Session = Depends(get_db)):
    _require_admin(authorization, db)
    return AdminStatsResponse(
        total_users=db.query(User).count(),
        total_doctors=db.query(Doctor).count(),
        total_appointments=db.query(Appointment).count(),
        total_hospitals=db.query(Hospital).count(),
        booked_appointments=db.query(Appointment).filter(Appointment.status == "approved").count(),
        cancelled_appointments=db.query(Appointment).filter(Appointment.status == "cancelled").count(),
    )


@router.get("/users", response_model=list[UserResponse])
def admin_users(authorization: str = Header(...), db: Session = Depends(get_db)):
    _require_admin(authorization, db)
    return db.query(User).order_by(User.id.desc()).all()


@router.get("/doctors", response_model=list[DoctorResponse])
def admin_doctors(authorization: str = Header(...), db: Session = Depends(get_db)):
    _require_admin(authorization, db)
    return db.query(Doctor).all()


@router.get("/appointments")
def admin_appointments(authorization: str = Header(...), db: Session = Depends(get_db)):
    _require_admin(authorization, db)
    appts = db.query(Appointment).order_by(Appointment.id.desc()).all()
    results = []
    for a in appts:
        results.append({
            "id": a.id,
            "patient_name": a.patient_name,
            "patient_email": a.user.email if a.user else None,
            "doctor_name": a.doctor.name if a.doctor else None,
            "doctor_specialization": a.doctor.specialization if a.doctor else None,
            "appointment_date": str(a.appointment_date),
            "appointment_time": str(a.appointment_time),
            "status": a.status,
            "notes": a.notes,
        })
    return results


@router.get("/hospitals", response_model=list[HospitalResponse])
def admin_hospitals(authorization: str = Header(...), db: Session = Depends(get_db)):
    _require_admin(authorization, db)
    return db.query(Hospital).all()
