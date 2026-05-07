from typing import Optional

from pydantic import BaseModel


class DoctorCreate(BaseModel):
    name: str
    specialization: str
    experience_years: int
    rating: Optional[float] = 0.0
    image: Optional[str] = ""


class DoctorResponse(BaseModel):
    id: int
    name: str
    specialization: str
    experience_years: int
    rating: float
    image: str

    model_config = {"from_attributes": True}
