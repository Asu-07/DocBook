"""
Idempotent seed: Central Service Hospital + link ALL doctors to it.

Run from backend folder:
  source venv/bin/activate && python seed_central_hospital.py

Default login for the central hospital portal (change in production):
  Email:    central.service@docbook.local
  Password: CentralService123!
"""

from passlib.context import CryptContext

from database import SessionLocal
from models.user import User
from models.hospital import Hospital
from models.doctor import Doctor

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

CENTRAL_EMAIL = "central.service@docbook.local"
CENTRAL_PASSWORD = "CentralService123!"
HOSPITAL_NAME = "Central Service Hospital"


def main() -> None:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == CENTRAL_EMAIL.lower()).first()
        if not user:
            user = User(
                name="Central Service Admin",
                email=CENTRAL_EMAIL.lower(),
                password_hash=pwd_context.hash(CENTRAL_PASSWORD),
                role="hospital",
            )
            db.add(user)
            db.flush()
            print(f"Created central hospital user: {CENTRAL_EMAIL}")
        else:
            print(f"Central hospital user already exists: id={user.id}")

        hosp = db.query(Hospital).filter(Hospital.user_id == user.id).first()
        if not hosp:
            hosp = db.query(Hospital).filter(Hospital.name == HOSPITAL_NAME).first()
        if not hosp:
            hosp = Hospital(
                name=HOSPITAL_NAME,
                address="Central campus — main service location",
                phone="+1-555-CENTRAL",
                user_id=user.id,
            )
            db.add(hosp)
            db.flush()
            print(f"Created hospital record: {HOSPITAL_NAME} (id={hosp.id})")
        else:
            print(f"Hospital already present: {hosp.name} (id={hosp.id})")

        hid = hosp.id
        count = 0
        for doc in db.query(Doctor).all():
            if doc.hospital_id != hid:
                doc.hospital_id = hid
                count += 1
        db.commit()
        total = db.query(Doctor).count()
        print(f"Linked {total} doctor(s) to Central Service Hospital (updated rows: {count}).")
        print("Done.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
