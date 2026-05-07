from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from config import DATABASE_URL


def _normalize_db_url(url: str) -> str:
    """SQLAlchemy maps bare postgresql:// to psycopg2 (legacy driver). We ship
    psycopg (v3), so coerce the scheme to postgresql+psycopg:// when the host
    didn't pre-qualify it. Handles Heroku's legacy postgres:// alias too."""
    if url.startswith("postgresql+"):
        return url
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://"):]
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://"):]
    return url


resolved_url = _normalize_db_url(DATABASE_URL)
is_sqlite = resolved_url.startswith("sqlite")
engine_kwargs = {}
if is_sqlite:
    engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(resolved_url, pool_pre_ping=True, **engine_kwargs)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
