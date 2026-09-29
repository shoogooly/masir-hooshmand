#!/usr/bin/env sh
set -eu

python -m app.db.bootstrap
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers "${MASIR_WEB_WORKERS:-1}"
