"""Seed required production data (idempotent)."""

import os

from passlib.context import CryptContext

from database import SessionLocal
from models.user import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def main() -> None:
    admin_email = os.getenv("ADMIN_EMAIL", "admin@docbook.com").strip().lower()
    admin_password = os.getenv("ADMIN_PASSWORD", "change-me-now")
    admin_name = os.getenv("ADMIN_NAME", "DocBook Admin")

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == admin_email).first()
        if existing:
            print(f"[SKIP] admin already exists: {admin_email}")
            return

        admin = User(
            name=admin_name,
            email=admin_email,
            password_hash=pwd_context.hash(admin_password),
            role="admin",
        )
        db.add(admin)
        db.commit()
        print(f"[OK] seeded admin: {admin_email}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
