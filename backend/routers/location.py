import json
import urllib.error
import urllib.parse
import urllib.request

from fastapi import APIRouter, HTTPException, Query

from schemas.location_schema import LocationReverseResponse

router = APIRouter(prefix="/api/v1/location", tags=["location"])

# Nominatim requires a valid User-Agent identifying the app.
_NOMINATIM_UA = "DocBook/1.0 (https://github.com/docbook; contact@docbook.local)"


def _normalize_region_from_address(address: dict) -> str:
    """Map OSM address parts to our Hospital.region strings (Delhi, Mumbai, Bangalore, ...)."""
    city = (address.get("city") or address.get("town") or address.get("village") or "").strip()
    state = (address.get("state") or "").strip()
    county = (address.get("county") or "").strip()

    blob = f"{city} {state} {county}".lower()

    if "delhi" in blob or city.lower() in ("new delhi", "delhi"):
        return "Delhi"
    if "mumbai" in blob or "thane" in city.lower():
        return "Mumbai"
    if "bengaluru" in blob or "bangalore" in blob:
        return "Bangalore"

    # Suburbs / districts often still map to metro
    if state and "maharashtra" in state.lower() and not city:
        return "Mumbai"
    if state and "karnataka" in state.lower() and not city:
        return "Bangalore"

    if city:
        return city.title()
    if state:
        return state.split(",")[0].strip().title()
    return "Delhi"


@router.get("/reverse", response_model=LocationReverseResponse)
def reverse_geocode(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
):
    params = urllib.parse.urlencode(
        {
            "lat": latitude,
            "lon": longitude,
            "format": "json",
            "addressdetails": 1,
        }
    )
    url = f"https://nominatim.openstreetmap.org/reverse?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": _NOMINATIM_UA})

    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            payload = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Geocoding service error: {e.code}") from e
    except urllib.error.URLError as e:
        raise HTTPException(status_code=502, detail="Could not reach geocoding service") from e
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=502, detail="Invalid geocoding response") from e

    address = payload.get("address") or {}
    display = payload.get("display_name") or f"{latitude}, {longitude}"
    region = _normalize_region_from_address(address)

    return LocationReverseResponse(
        region=region,
        label=display,
        latitude=latitude,
        longitude=longitude,
    )
