from pydantic import BaseModel


class LocationReverseResponse(BaseModel):
    region: str
    label: str
    latitude: float
    longitude: float
