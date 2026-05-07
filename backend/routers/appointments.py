from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session

from database import get_db
from models.appointment import Appointment
from models.doctor import Doctor
from models.user import User
from routers.auth import get_current_user, get_token_from_auth_header
from schemas.appointment_schema import AppointmentCreate, AppointmentResponse

router = APIRouter(prefix="/api/v1/appointments", tags=["appointments"])

ACTIVE_STATUSES = ("pending", "approved")


def _to_response(appt: Appointment) -> AppointmentResponse:
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


@router.post("/", response_model=AppointmentResponse, status_code=201)
def create_appointment(
    payload: AppointmentCreate,
    authorization: str = Header(...),
    db: Session = Depends(get_db),
):
    token = get_token_from_auth_header(authorization)
    user = get_current_user(token, db)

    doctor = db.query(Doctor).filter(Doctor.id == payload.doctor_id).first()
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")

    conflict = (
        db.query(Appointment)
        .filter(
            Appointment.doctor_id == payload.doctor_id,
            Appointment.appointment_date == payload.appointment_date,
            Appointment.appointment_time == payload.appointment_time,
            Appointment.status.in_(ACTIVE_STATUSES),
        )
        .first()
    )
    if conflict:
        raise HTTPException(status_code=409, detail="Time slot already booked")

    appt = Appointment(
        user_id=user.id,
        doctor_id=payload.doctor_id,
        patient_name=user.name,
        appointment_date=payload.appointment_date,
        appointment_time=payload.appointment_time,
        notes=payload.notes,
    )
    db.add(appt)
    db.commit()
    db.refresh(appt)
    return _to_response(appt)


@router.get("/me", response_model=list[AppointmentResponse])
def list_my_appointments(
    authorization: str = Header(...),
    db: Session = Depends(get_db),
):
    token = get_token_from_auth_header(authorization)
    user = get_current_user(token, db)

    appts = (
        db.query(Appointment)
        .filter(Appointment.user_id == user.id, Appointment.status.in_(ACTIVE_STATUSES))
        .order_by(Appointment.id.desc())
        .all()
    )
    return [_to_response(a) for a in appts]


@router.get("/doctor", response_model=list[AppointmentResponse])
def list_doctor_appointments(
    authorization: str = Header(...),
    db: Session = Depends(get_db),
):
    token = get_token_from_auth_header(authorization)
    user = get_current_user(token, db)

    if user.role != "doctor":
        raise HTTPException(status_code=403, detail="Only doctors can access this endpoint")

    doctor = db.query(Doctor).filter(Doctor.user_id == user.id).first()
    if not doctor:
        raise HTTPException(status_code=403, detail="No doctor profile linked to this account")

    appts = (
        db.query(Appointment)
        .filter(Appointment.doctor_id == doctor.id, Appointment.status.in_(ACTIVE_STATUSES))
        .order_by(Appointment.id.desc())
        .all()
    )
    return [_to_response(a) for a in appts]


@router.patch("/{appointment_id}/approve", response_model=AppointmentResponse)
def approve_appointment(
    appointment_id: int,
    authorization: str = Header(...),
    db: Session = Depends(get_db),
):
    token = get_token_from_auth_header(authorization)
    user = get_current_user(token, db)

    if user.role != "doctor":
        raise HTTPException(status_code=403, detail="Only doctors can approve appointments")

    doctor = db.query(Doctor).filter(Doctor.user_id == user.id).first()
    if not doctor:
        raise HTTPException(status_code=403, detail="No doctor profile linked to this account")

    appt = (
        db.query(Appointment)
        .filter(
            Appointment.id == appointment_id,
            Appointment.doctor_id == doctor.id,
            Appointment.status == "pending",
        )
        .first()
    )
    if not appt:
        raise HTTPException(status_code=404, detail="Pending appointment not found")

    appt.status = "approved"
    db.commit()
    db.refresh(appt)
    return _to_response(appt)


@router.delete("/{appointment_id}", status_code=204)
def cancel_appointment(
    appointment_id: int,
    authorization: str = Header(...),
    db: Session = Depends(get_db),
):
    token = get_token_from_auth_header(authorization)
    user = get_current_user(token, db)

    appt = (
        db.query(Appointment)
        .filter(
            Appointment.id == appointment_id,
            Appointment.user_id == user.id,
            Appointment.status.in_(ACTIVE_STATUSES),
        )
        .first()
    )
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")

    appt.status = "cancelled"
    db.commit()
