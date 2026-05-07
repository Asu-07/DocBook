from pydantic import BaseModel


class HospitalRegister(BaseModel):
    name: str
    email: str
    password: str
    hospital_name: str
    address: str | None = None
    phone: str | None = None


class HospitalResponse(BaseModel):
    id: int
    name: str
    region: str
    address: str | None = None
    phone: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    user_id: int

    model_config = {"from_attributes": True}


class HospitalDashboardResponse(BaseModel):
    hospital: HospitalResponse
    total_doctors: int
    total_appointments: int
    total_patients: int
