from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from models.doctor import Doctor
from models.appointment import Appointment
from models.hospital import Hospital
from routers.auth import get_current_user, get_token_from_auth_header
from schemas.doctor_schema import DoctorCreate, DoctorResponse
from schemas.hospital_schema import HospitalDashboardResponse, HospitalResponse
from schemas.appointment_schema import AppointmentConfirmRequest, AppointmentResponse

router = APIRouter(prefix="/api/v1/hospital", tags=["hospital"])
ACTIVE_STATUSES = ("pending", "approved")


def _to_appointment_response(appt: Appointment) -> AppointmentResponse:
    return AppointmentResponse(
        id=appt.id,
        doctor_id=appt.doctor_id,
        patient_name=appt.patient_name,
        patient_email=appt.user.email if appt.user else None,
        appointment_date=appt.appointment_date,
        appointment_time=appt.appointment_time,
        notes=appt.notes,
        status=appt.status,
        doctor_name=appt.doctor.name if appt.doctor else None,
        doctor_specialization=appt.doctor.specialization if appt.doctor else None,
    )


def _require_hospital(authorization: str, db: Session) -> tuple[User, Hospital]:
    token = get_token_from_auth_header(authorization)
    user = get_current_user(token, db)
    if user.role != "hospital":
        raise HTTPException(status_code=403, detail="Hospital access required")

    hospital = db.query(Hospital).filter(Hospital.user_id == user.id).first()
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital profile not found")
    return user, hospital


@router.get("/dashboard", response_model=HospitalDashboardResponse)
def hospital_dashboard(authorization: str = Header(...), db: Session = Depends(get_db)):
    _, hospital = _require_hospital(authorization, db)

    doctor_ids = [d.id for d in db.query(Doctor).filter(Doctor.hospital_id == hospital.id).all()]
    total_appointments = 0
    patient_ids: set[int] = set()

    if doctor_ids:
        appts = db.query(Appointment).filter(Appointment.doctor_id.in_(doctor_ids), Appointment.status.in_(ACTIVE_STATUSES)).all()
        total_appointments = len(appts)
        patient_ids = {a.user_id for a in appts}

    return HospitalDashboardResponse(
        hospital=HospitalResponse.model_validate(hospital),
        total_doctors=len(doctor_ids),
        total_appointments=total_appointments,
        total_patients=len(patient_ids),
    )


@router.get("/doctors", response_model=list[DoctorResponse])
def hospital_doctors(authorization: str = Header(...), db: Session = Depends(get_db)):
    _, hospital = _require_hospital(authorization, db)
    return db.query(Doctor).filter(Doctor.hospital_id == hospital.id).all()


@router.post("/doctors", response_model=DoctorResponse, status_code=201)
def add_hospital_doctor(
    payload: DoctorCreate,
    authorization: str = Header(...),
    db: Session = Depends(get_db),
):
    _, hospital = _require_hospital(authorization, db)

    doctor = Doctor(
        name=payload.name,
        specialization=payload.specialization,
        experience_years=payload.experience_years,
        rating=payload.rating or 0.0,
        image=payload.image or "",
        hospital_id=hospital.id,
    )
    db.add(doctor)
    db.commit()
    db.refresh(doctor)
    return doctor


@router.get("/appointments")
def hospital_appointments(authorization: str = Header(...), db: Session = Depends(get_db)):
    _, hospital = _require_hospital(authorization, db)

    doctor_ids = [d.id for d in db.query(Doctor).filter(Doctor.hospital_id == hospital.id).all()]
    if not doctor_ids:
        return []

    appts = (
        db.query(Appointment)
        .filter(Appointment.doctor_id.in_(doctor_ids))
        .order_by(Appointment.id.desc())
        .all()
    )
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


@router.patch("/appointments/{appointment_id}/confirm", response_model=AppointmentResponse)
def hospital_confirm_appointment(
    appointment_id: int,
    payload: AppointmentConfirmRequest,
    authorization: str = Header(...),
    db: Session = Depends(get_db),
):
    _, hospital = _require_hospital(authorization, db)

    doctor_ids = [d.id for d in db.query(Doctor).filter(Doctor.hospital_id == hospital.id).all()]
    if not doctor_ids:
        raise HTTPException(status_code=404, detail="No doctors linked to this hospital")

    appt = (
        db.query(Appointment)
        .filter(
            Appointment.id == appointment_id,
            Appointment.doctor_id.in_(doctor_ids),
            Appointment.status == "pending",
        )
        .first()
    )
    if not appt:
        raise HTTPException(status_code=404, detail="Pending appointment not found")

    appt.appointment_date = payload.appointment_date
    appt.appointment_time = payload.appointment_time
    appt.status = "approved"
    db.commit()
    db.refresh(appt)
    return _to_appointment_response(appt)


@router.get("/patients")
def hospital_patients(authorization: str = Header(...), db: Session = Depends(get_db)):
    _, hospital = _require_hospital(authorization, db)

    doctor_ids = [d.id for d in db.query(Doctor).filter(Doctor.hospital_id == hospital.id).all()]
    if not doctor_ids:
        return []

    appts = db.query(Appointment).filter(Appointment.doctor_id.in_(doctor_ids)).all()
    seen: set[int] = set()
    patients = []
    for a in appts:
        if a.user_id not in seen and a.user:
            seen.add(a.user_id)
            patients.append({
                "id": a.user.id,
                "name": a.user.name,
                "email": a.user.email,
                "total_appointments": sum(1 for x in appts if x.user_id == a.user_id),
            })
    return patients
