"""Copy core DocBook tables from SQLite into PostgreSQL.

Usage:
    SQLITE_PATH=./docbook.db DATABASE_URL=postgresql+psycopg://... python scripts/migrate_sqlite_to_postgres.py
"""

import os
import sqlite3
from typing import Any

from sqlalchemy import create_engine, text


TABLES = ("users", "hospitals", "doctors", "appointments")


def _fetch_rows(cursor: sqlite3.Cursor, table: str) -> tuple[list[str], list[tuple[Any, ...]]]:
    cursor.execute(f"SELECT * FROM {table}")
    columns = [desc[0] for desc in cursor.description]
    rows = cursor.fetchall()
    return columns, rows


def main() -> None:
    sqlite_path = os.getenv("SQLITE_PATH", "./docbook.db")
    postgres_url = os.getenv("DATABASE_URL")
    if not postgres_url:
        raise RuntimeError("DATABASE_URL must point to PostgreSQL")

    sqlite_conn = sqlite3.connect(sqlite_path)
    sqlite_cur = sqlite_conn.cursor()
    pg_engine = create_engine(postgres_url)

    with pg_engine.begin() as pg_conn:
        for table in TABLES:
            columns, rows = _fetch_rows(sqlite_cur, table)
            if not rows:
                print(f"[SKIP] {table}: no rows")
                continue

            columns_csv = ", ".join(columns)
            placeholders = ", ".join([f":{col}" for col in columns])
            upsert = text(f"INSERT INTO {table} ({columns_csv}) VALUES ({placeholders}) ON CONFLICT (id) DO NOTHING")

            payload = [dict(zip(columns, row)) for row in rows]
            pg_conn.execute(upsert, payload)
            print(f"[OK] {table}: copied {len(rows)} rows")

    sqlite_conn.close()
    print("Migration completed.")


if __name__ == "__main__":
    main()
