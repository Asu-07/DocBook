from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from database import Base


class Doctor(Base):
    __tablename__ = "doctors"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    specialization = Column(String, nullable=False)
    experience_years = Column(Integer, nullable=False)
    rating = Column(Float, default=0.0)
    image = Column(String, default="")
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    hospital_id = Column(Integer, ForeignKey("hospitals.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    appointments = relationship("Appointment", back_populates="doctor")
    hospital = relationship("Hospital", back_populates="doctors")
