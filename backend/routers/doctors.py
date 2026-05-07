from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db
from models.doctor import Doctor
from schemas.doctor_schema import DoctorResponse

router = APIRouter(prefix="/api/v1/doctors", tags=["doctors"])


@router.get("/", response_model=list[DoctorResponse])
def list_doctors(
    hospital_id: Optional[int] = Query(None),
    specialization: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(Doctor)
    if hospital_id is not None:
        query = query.filter(Doctor.hospital_id == hospital_id)
    if specialization:
        query = query.filter(Doctor.specialization == specialization.strip())
    return query.order_by(Doctor.name.asc()).all()
