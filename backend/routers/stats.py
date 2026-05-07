from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models.appointment import Appointment
from models.doctor import Doctor
from models.hospital import Hospital
from schemas.stats_schema import PublicStatsResponse

router = APIRouter(prefix="/api/v1/stats", tags=["stats"])


@router.get("/public", response_model=PublicStatsResponse)
def get_public_stats(db: Session = Depends(get_db)):
    region_rows = db.query(Hospital.region).distinct().all()
    total_regions = len({r[0] for r in region_rows if r[0]})
    return PublicStatsResponse(
        total_doctors=db.query(Doctor).count(),
        total_hospitals=db.query(Hospital).count(),
        total_appointments=db.query(Appointment).count(),
        total_regions=total_regions,
    )
