from typing import List, Optional

from pydantic import BaseModel, EmailStr


class UserRegister(BaseModel):
    name: str
    email: str
    password: str
    role: Optional[str] = "user"


class UserLogin(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    role: str

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str = "user"


class FaceEnrollRequest(BaseModel):
    """128-float face descriptor produced by face-api.js in the browser."""
    descriptor: List[float]


class FaceLoginRequest(BaseModel):
    email: str
    descriptor: List[float]


class FaceStatusResponse(BaseModel):
    enrolled: bool
