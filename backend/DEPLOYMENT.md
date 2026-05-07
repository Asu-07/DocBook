# DocBook Backend Deployment (Day 1)

## 1) Environment variables

Use `backend/.env.example` as the template.

Required for production:

- `APP_ENV=production`
- `DATABASE_URL=postgresql+psycopg://...`
- `SECRET_KEY=<strong-random-secret>`
- `CORS_ORIGINS=https://your-frontend-domain`

## 2) PostgreSQL migration path

1. Ensure PostgreSQL DB is provisioned.
2. Point `DATABASE_URL` to PostgreSQL.
3. Start app once so SQLAlchemy creates schema (`Base.metadata.create_all`).
4. Optional data copy from SQLite:

```bash
cd backend
SQLITE_PATH=./docbook.db DATABASE_URL=postgresql+psycopg://... python scripts/migrate_sqlite_to_postgres.py
```

5. Seed production admin:

```bash
cd backend
ADMIN_EMAIL=admin@docbook.com ADMIN_PASSWORD='<strong-password>' python scripts/seed_prod.py
```

## 3) Render deployment

`backend/render.yaml` contains a ready service definition.

Render settings equivalent:

- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Health path: `/health`

## 4) Post-deploy smoke tests

```bash
cd backend
bash scripts/smoke_test.sh https://your-backend-domain
```

Verify:

- `/health` returns 200
- `/docs` loads
- Login/register and appointment flow works with production DB
