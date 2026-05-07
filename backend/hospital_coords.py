"""Synthetic lat/lon per region for demo / backfill when real coordinates are missing."""

REGION_CENTERS: dict[str, tuple[float, float]] = {
    "Delhi": (28.6139, 77.2090),
    "Mumbai": (19.0760, 72.8777),
    "Bangalore": (12.9716, 77.5946),
}


def coords_for_region(region: str, salt: int) -> tuple[float, float]:
    lat0, lon0 = REGION_CENTERS.get(region, REGION_CENTERS["Delhi"])
    lat = lat0 + (salt % 9) * 0.018 - 0.072
    lon = lon0 + (salt % 11) * 0.018 - 0.09
    return round(lat, 6), round(lon, 6)
