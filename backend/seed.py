"""Seed 15 Delhi hospitals and doctors for booking flow demo."""

from passlib.context import CryptContext
from sqlalchemy import inspect, text

from database import Base, SessionLocal, engine
from hospital_coords import coords_for_region
from models.doctor import Doctor
from models.hospital import Hospital
from models.user import User

Base.metadata.create_all(bind=engine)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

HOSPITALS = [
    # Delhi (15)
    ("Apollo Hospital", "Sarita Vihar, New Delhi", "Delhi"),
    ("Fortis Hospital", "Shalimar Bagh, New Delhi", "Delhi"),
    ("Max Super Specialty Hospital", "Saket, New Delhi", "Delhi"),
    ("BLK Max Hospital", "Rajendra Place, New Delhi", "Delhi"),
    ("AIIMS Delhi", "Ansari Nagar, New Delhi", "Delhi"),
    ("Safdarjung Hospital", "Safdarjung Enclave, New Delhi", "Delhi"),
    ("Sir Ganga Ram Hospital", "Old Rajinder Nagar, New Delhi", "Delhi"),
    ("Indraprastha Apollo Hospital", "Jasola, New Delhi", "Delhi"),
    ("Holy Family Hospital", "Okhla, New Delhi", "Delhi"),
    ("Rockland Hospital", "Qutub Institutional Area, New Delhi", "Delhi"),
    ("Primus Hospital", "Chanakyapuri, New Delhi", "Delhi"),
    ("Venkateshwar Hospital", "Dwarka, New Delhi", "Delhi"),
    ("Artemis Lite Hospital", "South Extension, New Delhi", "Delhi"),
    ("Saroj Hospital", "Rohini, New Delhi", "Delhi"),
    ("Metro Hospital", "Preet Vihar, New Delhi", "Delhi"),
    # Mumbai (demo)
    ("Lilavati Hospital", "Bandra, Mumbai", "Mumbai"),
    ("Nanavati Super Specialty Hospital", "Vile Parle, Mumbai", "Mumbai"),
    ("Kokilaben Dhirubhai Ambani Hospital", "Andheri, Mumbai", "Mumbai"),
    # Bangalore (demo)
    ("Narayana Health City", "Bommasandra, Bangalore", "Bangalore"),
    ("Apollo Hospital Bangalore", "Bannerghatta Road, Bangalore", "Bangalore"),
    ("Fortis Hospital Bannerghatta", "Bannerghatta, Bangalore", "Bangalore"),
]

SPECIALIZATIONS = [
    "General Physician",
    "Cardiologist",
    "Dermatologist",
    "Orthopedic",
    "Neurologist",
    "Pediatrician",
    "Gynecologist",
    "Dentist",
]


def ensure_hospital_user(db, hospital_name: str) -> User:
    email_slug = hospital_name.lower().replace(" ", ".")
    email = f"{email_slug}@docbook.local"
    user = db.query(User).filter(User.email == email).first()
    if user:
        return user

    user = User(
        name=f"{hospital_name} Admin",
        email=email,
        password_hash=pwd_context.hash("Hospital123!"),
        role="hospital",
    )
    db.add(user)
    db.flush()
    return user


def main() -> None:
    inspector = inspect(engine)
    columns = {col["name"] for col in inspector.get_columns("hospitals")}
    if "region" not in columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE hospitals ADD COLUMN region VARCHAR DEFAULT 'Delhi'"))
            conn.execute(text("UPDATE hospitals SET region = 'Delhi' WHERE region IS NULL OR region = ''"))

    db = SessionLocal()
    try:
        created_hospitals = 0
        created_doctors = 0
        for index, (name, address, region) in enumerate(HOSPITALS, start=1):
            user = ensure_hospital_user(db, name)
            hospital = db.query(Hospital).filter(Hospital.name == name).first()
            if not hospital:
                lat, lon = coords_for_region(region, index)
                hospital = Hospital(
                    name=name,
                    region=region,
                    address=address,
                    phone=f"+91-11-4000{index:03d}",
                    latitude=lat,
                    longitude=lon,
                    user_id=user.id,
                )
                db.add(hospital)
                db.flush()
                created_hospitals += 1
            elif hospital.latitude is None or hospital.longitude is None:
                lat, lon = coords_for_region(region, index)
                hospital.latitude = lat
                hospital.longitude = lon

            for spec_index, spec in enumerate(SPECIALIZATIONS, start=1):
                doc_name = f"Dr. {name.split()[0]} {spec.split()[0]} {spec_index}"
                exists = (
                    db.query(Doctor)
                    .filter(
                        Doctor.name == doc_name,
                        Doctor.hospital_id == hospital.id,
                    )
                    .first()
                )
                if exists:
                    continue

                db.add(
                    Doctor(
                        name=doc_name,
                        specialization=spec,
                        experience_years=4 + (spec_index % 10),
                        rating=4.2 + ((spec_index % 5) * 0.1),
                        image=f"https://ui-avatars.com/api/?name={doc_name.replace(' ', '+')}&background=1a1a2e&color=fff&size=400",
                        hospital_id=hospital.id,
                    )
                )
                created_doctors += 1

        for h in db.query(Hospital).all():
            if h.latitude is None or h.longitude is None:
                h.latitude, h.longitude = coords_for_region(h.region or "Delhi", h.id)

        db.commit()
        print(f"Seed complete. New hospitals: {created_hospitals}, new doctors: {created_doctors}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
