from pydantic import BaseModel


class AdminStatsResponse(BaseModel):
    total_users: int
    total_doctors: int
    total_appointments: int
    total_hospitals: int
    booked_appointments: int
    cancelled_appointments: int
