"""Demo seed: ~15 hospitals across Indian metros, 50 doctors, patient users, and appointments.

Run from backend folder:
  ./.venv/Scripts/python.exe seed_demo.py
or
  python seed_demo.py

This is destructive: it clears existing appointments, doctors, hospitals, and the
auto-generated hospital/patient demo users (anything with @docbook.local) before seeding.
Hospital portal logins use the password "Hospital123!"; patients use "Patient123!".
"""

from __future__ import annotations

import random
from datetime import date, time, timedelta

from passlib.context import CryptContext
from sqlalchemy import inspect, text

from database import Base, SessionLocal, engine
from models.appointment import Appointment
from models.doctor import Doctor
from models.hospital import Hospital
from models.user import User

Base.metadata.create_all(bind=engine)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
random.seed(42)

HOSPITAL_PASSWORD = "Hospital123!"
PATIENT_PASSWORD = "Patient123!"
DOCTOR_PASSWORD = "Doctor123!"

# (name, address, region, phone, latitude, longitude)
HOSPITALS: list[tuple[str, str, str, str, float, float]] = [
    ("AIIMS Delhi",                     "Ansari Nagar, New Delhi",                   "Delhi",     "+91-11-26588500", 28.5672, 77.2100),
    ("Apollo Hospital Delhi",           "Sarita Vihar, New Delhi",                   "Delhi",     "+91-11-71791090", 28.5358, 77.2906),
    ("Fortis Escorts Heart Institute",  "Okhla Road, New Delhi",                     "Delhi",     "+91-11-47135000", 28.5538, 77.2789),
    ("Lilavati Hospital",               "Bandra West, Mumbai",                       "Mumbai",    "+91-22-26751000", 19.0511, 72.8259),
    ("Kokilaben Dhirubhai Ambani Hospital", "Andheri West, Mumbai",                  "Mumbai",    "+91-22-30999999", 19.1336, 72.8267),
    ("Manipal Hospital Bangalore",      "Old Airport Road, Bengaluru",               "Bangalore", "+91-80-25024444", 12.9583, 77.6492),
    ("Narayana Health City",            "Bommasandra, Bengaluru",                    "Bangalore", "+91-80-71222222", 12.8003, 77.6960),
    ("Apollo Hospitals Chennai",        "Greams Road, Chennai",                      "Chennai",   "+91-44-28293333", 13.0635, 80.2532),
    ("MIOT International",              "Manapakkam, Chennai",                       "Chennai",   "+91-44-42002288", 13.0192, 80.1813),
    ("AIG Hospitals",                   "Gachibowli, Hyderabad",                     "Hyderabad", "+91-40-49244444", 17.4239, 78.3489),
    ("Yashoda Hospitals",               "Somajiguda, Hyderabad",                     "Hyderabad", "+91-40-23319999", 17.4239, 78.4582),
    ("AMRI Hospital Dhakuria",          "Dhakuria, Kolkata",                         "Kolkata",   "+91-33-66800000", 22.4990, 88.3666),
    ("Ruby General Hospital",           "Kasba, Kolkata",                            "Kolkata",   "+91-33-39888000", 22.5145, 88.3992),
    ("Ruby Hall Clinic",                "Sassoon Road, Pune",                        "Pune",      "+91-20-66455100", 18.5290, 73.8788),
    ("Sahyadri Super Specialty",        "Karve Road, Pune",                          "Pune",      "+91-20-67215555", 18.5089, 73.8316),
    ("Apollo Hospital Ahmedabad",       "Plot No 1A, Bhat GIDC, Gandhinagar",        "Ahmedabad", "+91-79-66701800", 23.1117, 72.6304),
    ("Fortis Hospital Jaipur",          "Jawaharlal Nehru Marg, Jaipur",             "Jaipur",    "+91-141-2547000", 26.8830, 75.8158),
    ("Medanta Lucknow",                 "Sector A, Pocket 1, Sushant Golf City",     "Lucknow",   "+91-522-4505050", 26.7783, 81.0086),
]

# 50 specialization slots, sized so each hospital gets 2-4 doctors
SPECIALIZATIONS = [
    "General Physician", "Cardiologist", "Dermatologist", "Orthopedic Surgeon",
    "Neurologist", "Pediatrician", "Gynecologist", "Dentist",
    "ENT Specialist", "Ophthalmologist", "Psychiatrist", "Endocrinologist",
    "Gastroenterologist", "Pulmonologist", "Urologist", "Oncologist",
    "Nephrologist", "Rheumatologist",
]

INDIAN_FIRST_NAMES = [
    "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Ishaan", "Krishna",
    "Rohan", "Kabir", "Dhruv", "Aryan", "Karthik", "Rahul", "Ananya", "Diya",
    "Aaradhya", "Saanvi", "Pari", "Riya", "Anaya", "Ira", "Kavya", "Meera",
    "Priya", "Neha", "Pooja", "Shreya", "Nikhil", "Vikram", "Siddharth", "Akash",
    "Manish", "Sandeep", "Rajesh", "Suresh", "Lakshmi", "Sunita", "Kavita", "Ritu",
]
INDIAN_LAST_NAMES = [
    "Sharma", "Verma", "Singh", "Kumar", "Patel", "Mehta", "Iyer", "Nair",
    "Reddy", "Rao", "Banerjee", "Chatterjee", "Das", "Gupta", "Agarwal", "Joshi",
    "Mukherjee", "Saxena", "Mishra", "Pandey", "Khan", "Kapoor", "Malhotra", "Bose",
]


def _slug(s: str) -> str:
    cleaned = "".join(ch for ch in s.lower().replace(" ", ".").replace("-", "") if ch.isalnum() or ch == ".")
    # Collapse runs of dots (e.g. "Dr. Krishna" → "dr.krishna" not "dr..krishna").
    while ".." in cleaned:
        cleaned = cleaned.replace("..", ".")
    return cleaned.strip(".")


def _avatar(name: str) -> str:
    return f"https://ui-avatars.com/api/?name={name.replace(' ', '+')}&background=1a1a2e&color=fff&size=400&bold=true"


def _ensure_region_column() -> None:
    inspector = inspect(engine)
    columns = {col["name"] for col in inspector.get_columns("hospitals")}
    if "region" not in columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE hospitals ADD COLUMN region VARCHAR DEFAULT 'Delhi'"))


def _wipe_demo_data(db) -> None:
    db.query(Appointment).delete()
    db.query(Doctor).delete()
    # Detach hospitals from users so we can drop hospital admin users cleanly.
    db.query(Hospital).delete()
    db.query(User).filter(User.email.like("%@docbook.local")).delete(synchronize_session=False)
    db.commit()


def _make_hospital_user(db, hospital_name: str) -> User:
    email = f"{_slug(hospital_name)}@docbook.local"
    user = User(
        name=f"{hospital_name} Admin",
        email=email,
        password_hash=pwd_context.hash(HOSPITAL_PASSWORD),
        role="hospital",
    )
    db.add(user)
    db.flush()
    return user


def _make_patient_users(db, count: int) -> list[User]:
    users: list[User] = []
    for i in range(count):
        first = INDIAN_FIRST_NAMES[i % len(INDIAN_FIRST_NAMES)]
        last = INDIAN_LAST_NAMES[(i * 3) % len(INDIAN_LAST_NAMES)]
        full = f"{first} {last}"
        email = f"patient{i + 1:02d}.{_slug(full)}@docbook.local"
        users.append(
            User(
                name=full,
                email=email,
                password_hash=pwd_context.hash(PATIENT_PASSWORD),
                role="user",
            )
        )
    db.add_all(users)
    db.flush()
    return users


def _seed_hospitals(db) -> list[Hospital]:
    hospitals: list[Hospital] = []
    for name, address, region, phone, lat, lon in HOSPITALS:
        admin = _make_hospital_user(db, name)
        hospital = Hospital(
            name=name,
            region=region,
            address=address,
            phone=phone,
            latitude=lat,
            longitude=lon,
            user_id=admin.id,
        )
        db.add(hospital)
        hospitals.append(hospital)
    db.flush()
    return hospitals


def _seed_doctors(db, hospitals: list[Hospital], target: int = 50) -> list[Doctor]:
    """Distribute `target` doctors across hospitals, rotating specializations.

    Each doctor also gets a matching `User` row with role='doctor', so the doctor
    portal at /doctor/login is demoable end-to-end.
    """
    doctors: list[Doctor] = []
    used_names: set[str] = set()
    used_emails: set[str] = set()
    for i in range(target):
        hospital = hospitals[i % len(hospitals)]
        spec = SPECIALIZATIONS[i % len(SPECIALIZATIONS)]
        # Pick a unique-ish doctor name
        for _ in range(20):
            first = random.choice(INDIAN_FIRST_NAMES)
            last = random.choice(INDIAN_LAST_NAMES)
            name = f"Dr. {first} {last}"
            if name not in used_names:
                used_names.add(name)
                break
        else:
            name = f"Dr. {random.choice(INDIAN_FIRST_NAMES)} {random.choice(INDIAN_LAST_NAMES)} {i}"
            used_names.add(name)

        # Build a unique email — append a counter if name collides on the slug.
        base = _slug(name)
        email = f"{base}@docbook.local"
        suffix = 2
        while email in used_emails:
            email = f"{base}{suffix}@docbook.local"
            suffix += 1
        used_emails.add(email)

        doctor_user = User(
            name=name,
            email=email,
            password_hash=pwd_context.hash(DOCTOR_PASSWORD),
            role="doctor",
        )
        db.add(doctor_user)
        db.flush()

        doctors.append(
            Doctor(
                name=name,
                specialization=spec,
                experience_years=random.randint(3, 28),
                rating=round(random.uniform(3.8, 4.95), 1),
                image=_avatar(name),
                hospital_id=hospital.id,
                user_id=doctor_user.id,
            )
        )
    db.add_all(doctors)
    db.flush()
    return doctors


def _seed_appointments(db, patients: list[User], doctors: list[Doctor], target: int = 80) -> int:
    today = date.today()
    statuses_past = ["completed", "completed", "completed", "cancelled"]
    statuses_future = ["pending", "pending", "confirmed", "confirmed", "confirmed"]
    sample_notes = [
        "Routine check-up.",
        "Follow-up after lab tests.",
        "Persistent headache for two weeks.",
        "Annual health screening.",
        "Knee pain, requesting evaluation.",
        "Skin allergy consultation.",
        "Child fever and cough — requesting same-day slot.",
        "Pre-surgery review.",
        "Reports review after MRI.",
        None,
        None,
    ]
    slot_times = [time(9, 30), time(10, 0), time(11, 15), time(12, 0),
                  time(14, 30), time(15, 45), time(16, 30), time(17, 0)]

    appointments: list[Appointment] = []
    for i in range(target):
        patient = random.choice(patients)
        doctor = random.choice(doctors)
        # Mix of past (~40%) and future (~60%) appointments
        if random.random() < 0.4:
            offset = -random.randint(1, 90)
            status = random.choice(statuses_past)
        else:
            offset = random.randint(0, 45)
            status = random.choice(statuses_future)
        appt_date = today + timedelta(days=offset)
        appointments.append(
            Appointment(
                user_id=patient.id,
                doctor_id=doctor.id,
                patient_name=patient.name,
                appointment_date=appt_date,
                appointment_time=random.choice(slot_times),
                notes=random.choice(sample_notes),
                status=status,
            )
        )
    db.add_all(appointments)
    db.flush()
    return len(appointments)


def main() -> None:
    _ensure_region_column()
    db = SessionLocal()
    try:
        _wipe_demo_data(db)
        hospitals = _seed_hospitals(db)
        patients = _make_patient_users(db, count=25)
        doctors = _seed_doctors(db, hospitals, target=50)
        appt_count = _seed_appointments(db, patients, doctors, target=80)
        db.commit()

        regions = sorted({h.region for h in hospitals})
        print("Demo seed complete.")
        print(f"  Hospitals : {len(hospitals)} across {len(regions)} regions ({', '.join(regions)})")
        print(f"  Doctors   : {len(doctors)} (password: {DOCTOR_PASSWORD})")
        print(f"  Patients  : {len(patients)} (password: {PATIENT_PASSWORD})")
        print(f"  Appointments: {appt_count}")
        print()
        print("Sample logins:")
        print(f"  Patient : patient01.{_slug(patients[0].name)}@docbook.local / {PATIENT_PASSWORD}")
        print(f"  Doctor  : {_slug(doctors[0].name)}@docbook.local / {DOCTOR_PASSWORD}")
        print(f"  Hospital: {_slug(hospitals[0].name)}@docbook.local / {HOSPITAL_PASSWORD}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
