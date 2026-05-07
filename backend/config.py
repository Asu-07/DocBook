import os
from dotenv import load_dotenv

load_dotenv()

APP_ENV = os.getenv("APP_ENV", "development").strip().lower()
IS_PRODUCTION = APP_ENV == "production"

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

SECRET_KEY = os.getenv("SECRET_KEY", "")
if IS_PRODUCTION and not SECRET_KEY:
    raise RuntimeError("SECRET_KEY must be set in production")
if not SECRET_KEY:
    SECRET_KEY = "fallback-dev-secret"

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./docbook.db")
if IS_PRODUCTION and DATABASE_URL.startswith("sqlite"):
    raise RuntimeError("DATABASE_URL must point to PostgreSQL in production")

# Comma-separated list: "https://docbook.app,https://www.docbook.app"
cors_origins_raw = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:4200,http://127.0.0.1:4200",
)
CORS_ORIGINS = [origin.strip() for origin in cors_origins_raw.split(",") if origin.strip()]
