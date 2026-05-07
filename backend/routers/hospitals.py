from math import atan2, cos, radians, sin, sqrt

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models.hospital import Hospital
from models.doctor import Doctor
from schemas.hospital_schema import HospitalResponse

router = APIRouter(prefix="/api/v1/hospitals", tags=["hospitals"])


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return r * c


@router.get("/regions", response_model=list[str])
def list_regions(db: Session = Depends(get_db)):
    rows = db.query(Hospital.region).distinct().all()
    names = sorted({r[0] for r in rows if r and r[0]})
    return names


@router.get("/near", response_model=list[HospitalResponse])
def list_hospitals_near(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(75, ge=5, le=500),
    db: Session = Depends(get_db),
):
    """Hospitals within radius (km) of a point, ordered nearest first. Requires latitude/longitude on rows."""
    rows = (
        db.query(Hospital)
        .filter(Hospital.latitude.isnot(None), Hospital.longitude.isnot(None))
        .all()
    )
    scored: list[tuple[float, Hospital]] = []
    for h in rows:
        d = _haversine_km(latitude, longitude, float(h.latitude), float(h.longitude))
        if d <= radius_km:
            scored.append((d, h))
    scored.sort(key=lambda x: x[0])
    return [h for _, h in scored]


@router.get("/", response_model=list[HospitalResponse])
def list_hospitals(
    region: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    query = db.query(Hospital)
    if region:
        normalized_region = region.strip()
        query = query.filter(func.lower(Hospital.region) == normalized_region.lower())
    return query.order_by(Hospital.name.asc()).all()


@router.get("/{hospital_id}/doctor-types", response_model=list[str])
def get_doctor_types(hospital_id: int, db: Session = Depends(get_db)):
    hospital = db.query(Hospital).filter(Hospital.id == hospital_id).first()
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")

    rows = (
        db.query(Doctor.specialization)
        .filter(Doctor.hospital_id == hospital_id)
        .distinct()
        .order_by(Doctor.specialization.asc())
        .all()
    )
    return [row[0] for row in rows]
