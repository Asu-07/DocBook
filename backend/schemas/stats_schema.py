from pydantic import BaseModel


class PublicStatsResponse(BaseModel):
    total_doctors: int
    total_hospitals: int
    total_appointments: int
    total_regions: int
