"""Migration script: add hospitals table, hospital_id to doctors, seed admin user."""

import sqlite3
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

conn = sqlite3.connect("docbook.db")
cursor = conn.cursor()

# 1. Create hospitals table if not exists
cursor.execute("""
    CREATE TABLE IF NOT EXISTS hospitals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR NOT NULL,
        address VARCHAR,
        phone VARCHAR,
        user_id INTEGER NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
""")
print("[OK] hospitals table created")

# 2. Add hospital_id column to doctors if not exists
cursor.execute("PRAGMA table_info(doctors)")
columns = [col[1] for col in cursor.fetchall()]
if "hospital_id" not in columns:
    cursor.execute("ALTER TABLE doctors ADD COLUMN hospital_id INTEGER REFERENCES hospitals(id)")
    print("[OK] hospital_id added to doctors")
else:
    print("[SKIP] hospital_id already exists in doctors")

# 3. Seed admin user if not exists
cursor.execute("SELECT id FROM users WHERE role = 'admin' LIMIT 1")
if cursor.fetchone() is None:
    admin_hash = pwd_context.hash("admin123")
    cursor.execute(
        "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
        ("Admin", "admin@docbook.com", admin_hash, "admin"),
    )
    print("[OK] Admin user created (admin@docbook.com / admin123)")
else:
    print("[SKIP] Admin user already exists")

conn.commit()
conn.close()
print("\nMigration complete!")
