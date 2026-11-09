#!/bin/sh
set -e
cd /app

case "$1" in
  api)
    if [ -n "$DATABASE_URL" ]; then
      alembic upgrade head
    fi
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000
    ;;
  worker)
    exec supercronic /app/crontab
    ;;
  job)
    shift
    exec python scripts/run_coverage_signals.py "$@"
    ;;
  *)
    exec "$@"
    ;;
esac
