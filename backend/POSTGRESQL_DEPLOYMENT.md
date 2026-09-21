# PostgreSQL deployment

Set these environment variables in the hosting panel:

```text
MASIR_ENV=production
MASIR_SECRET_KEY=<a random value with at least 32 characters>
MASIR_DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:5432/DB?sslmode=require
MASIR_FRONTEND_ORIGIN=https://your-domain.example
```

Use `sh start.sh` as the backend start command. It creates a fresh schema or
upgrades an existing versioned database before starting one Uvicorn worker.

For Runflare, deploy the repository root as a Docker service. The root
`Dockerfile` builds React and serves it from the same FastAPI container, so the
site and API use one item; PostgreSQL uses the second item.

On a fresh production database, the application creates only the protected
primary administrator account with phone `09399506609`. Other local/demo data
is not copied. SMS.ir, Bale, Zarinpal, and AI secrets must be entered again in
the administration panel because they are encrypted for each deployment.

Keep the database private, enable daily backups in the hosting panel, and do
not commit `.env` files or database credentials.
