from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from config import APP_ENV, CORS_ORIGINS
from database import engine, Base
from routers import auth, doctors, appointments, hospitals
from routers import admin as admin_router
from routers import hospital as hospital_router
from routers import location as location_router
from routers import stats as stats_router

Base.metadata.create_all(bind=engine)


def _ensure_hospital_region_column() -> None:
    inspector = inspect(engine)
    columns = {col["name"] for col in inspector.get_columns("hospitals")}
    if "region" in columns:
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE hospitals ADD COLUMN region VARCHAR DEFAULT 'Delhi'"))
        conn.execute(text("UPDATE hospitals SET region = 'Delhi' WHERE region IS NULL OR region = ''"))


_ensure_hospital_region_column()


def _ensure_hospital_lat_lon_columns() -> None:
    inspector = inspect(engine)
    columns = {col["name"] for col in inspector.get_columns("hospitals")}
    with engine.begin() as conn:
        if "latitude" not in columns:
            conn.execute(text("ALTER TABLE hospitals ADD COLUMN latitude FLOAT"))
        if "longitude" not in columns:
            conn.execute(text("ALTER TABLE hospitals ADD COLUMN longitude FLOAT"))


_ensure_hospital_lat_lon_columns()


def _ensure_user_face_descriptor_column() -> None:
    inspector = inspect(engine)
    columns = {col["name"] for col in inspector.get_columns("users")}
    if "face_descriptor" in columns:
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN face_descriptor TEXT"))


_ensure_user_face_descriptor_column()


def _backfill_hospital_coordinates() -> None:
    """Assign synthetic lat/lon from region when missing so /hospitals/near works."""
    from database import SessionLocal
    from hospital_coords import coords_for_region
    from models.hospital import Hospital

    db = SessionLocal()
    try:
        updated = False
        for h in db.query(Hospital).all():
            if h.latitude is None or h.longitude is None:
                h.latitude, h.longitude = coords_for_region(h.region or "Delhi", h.id)
                updated = True
        if updated:
            db.commit()
    finally:
        db.close()


_backfill_hospital_coordinates()

app = FastAPI(title="DocBook API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(doctors.router)
app.include_router(appointments.router)
app.include_router(hospitals.router)
app.include_router(admin_router.router)
app.include_router(hospital_router.router)
app.include_router(location_router.router)
app.include_router(stats_router.router)


@app.get("/")
def health():
    return {"status": "ok", "app": "DocBook API", "env": APP_ENV}


@app.get("/health")
def healthcheck():
    return {"status": "ok"}
