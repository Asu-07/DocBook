from sqlalchemy import Column, Integer, String, DateTime, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="user")
    # JSON-encoded 128-float face descriptor produced by face-api.js. Null until enrolled.
    face_descriptor = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    appointments = relationship("Appointment", back_populates="user")
