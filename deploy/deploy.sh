#!/usr/bin/env bash
# Repeatable app release on the EC2 host. Infra/bootstrap is Terraform + user_data.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILE="docker-compose.aws.yml"
ENV_FILE="backend/.env"
FRONTEND_ENV_FILE="frontend/.env"

echo "==> deploy: repo root ${ROOT_DIR}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "error: missing ${ENV_FILE}. Create it on the instance before deploying." >&2
  exit 1
fi

if ! grep -q 'sslmode=require' "$ENV_FILE"; then
  echo "error: DATABASE_URL in ${ENV_FILE} must include sslmode=require (RDS)." >&2
  exit 1
fi

if [[ ! -f "$FRONTEND_ENV_FILE" ]]; then
  echo "error: missing ${FRONTEND_ENV_FILE} (AUTH_USERNAME, AUTH_PASSWORD, AUTH_SECRET)." >&2
  exit 1
fi

if [[ -z "${NEXT_PUBLIC_API_URL:-}" ]]; then
  # Prefer Elastic IP from the instance metadata association; fall back to public IPv4.
  TOKEN="$(curl -fsS -X PUT "http://169.254.169.254/latest/api/token" \
    -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" || true)"
  META_OPTS=()
  if [[ -n "${TOKEN}" ]]; then
    META_OPTS=(-H "X-aws-ec2-metadata-token: ${TOKEN}")
  fi
  PUBLIC_IP="$(curl -fsS "${META_OPTS[@]}" http://169.254.169.254/latest/meta-data/public-ipv4 || true)"
  if [[ -z "${PUBLIC_IP}" ]]; then
    echo "error: set NEXT_PUBLIC_API_URL=http://<ElasticIP> (no trailing slash)." >&2
    exit 1
  fi
  export NEXT_PUBLIC_API_URL="http://${PUBLIC_IP}"
fi

export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL%/}"
echo "==> NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}"

if [[ -d .git ]]; then
  echo "==> git: fetch + fast-forward current branch"
  git fetch --prune origin
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  if git show-ref --verify --quiet "refs/remotes/origin/${BRANCH}"; then
    git merge --ff-only "origin/${BRANCH}"
  else
    echo "warn: no origin/${BRANCH}; continuing with local tree" >&2
  fi
fi

echo "==> docker compose build"
docker compose -f "$COMPOSE_FILE" build

echo "==> docker compose up -d"
docker compose -f "$COMPOSE_FILE" up -d

echo "==> waiting for http://127.0.0.1/health"
ATTEMPTS=36
SLEEP_SECS=5
for ((i = 1; i <= ATTEMPTS; i++)); do
  if curl -fsS "http://127.0.0.1/health" >/dev/null; then
    echo "==> health ok"
    docker compose -f "$COMPOSE_FILE" ps
    exit 0
  fi
  sleep "$SLEEP_SECS"
done

echo "error: health check failed after $((ATTEMPTS * SLEEP_SECS))s" >&2
docker compose -f "$COMPOSE_FILE" ps || true
docker compose -f "$COMPOSE_FILE" logs --tail=80 || true
exit 1
