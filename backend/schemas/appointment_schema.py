from pydantic import BaseModel
from datetime import date, time


class AppointmentCreate(BaseModel):
    doctor_id: int
    appointment_date: date
    appointment_time: time
    notes: str | None = None


class AppointmentResponse(BaseModel):
    id: int
    doctor_id: int
    patient_name: str
    patient_email: str | None = None
    appointment_date: date
    appointment_time: time
    notes: str | None = None
    status: str
    doctor_name: str | None = None
    doctor_specialization: str | None = None

    model_config = {"from_attributes": True}


class AppointmentConfirmRequest(BaseModel):
    appointment_date: date
    appointment_time: time
