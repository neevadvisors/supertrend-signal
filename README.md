# Neev Signals

Monorepo for NSE equity **NEEV AI Renko Supertrend** signals: FastAPI backend + Next.js frontend.

Search and multi-select NSE equities, fetch intraday candles from Dhan (15m, 1h, 4h), and show signals with charts and responsive cards.

## Structure

```
neev-signals/
├── backend/                 # FastAPI API (uvicorn)
│   ├── app/                 # routes, schemas, services
│   ├── src/                 # domain: Dhan client, indicators, signals, instruments
│   └── data/                # cached security master CSV
├── frontend/                # Next.js 15 UI
├── deploy/                  # nginx.conf + deploy.sh (on-box app releases)
├── infra/terraform/         # EC2 + EIP + RDS + security groups
├── docker-compose.yml       # local stack (Postgres + bind mounts)
└── docker-compose.aws.yml   # AWS stack (RDS external; nginx on :80)
```

## Local setup

One-time:

```bash
cd ~/Documents/neev-signals
python3 -m venv .venv
source .venv/bin/activate
npm install                    # root helper (concurrently)
npm run install:all            # backend pip + frontend npm
cp backend/.env.example backend/.env   # or use root .env
```

Edit `backend/.env` (or root `.env`) with your Dhan Client ID, PIN, and TOTP secret (enable TOTP under **Access DhanHQ APIs** on [web.dhan.co](https://web.dhan.co)). The API mints and refreshes access tokens automatically. The API loads `backend/.env` first, then the parent repo `.env`.

### Run both (recommended)

From the repo root:

```bash
npm run dev
```

Starts FastAPI on `:8000` and Next.js on `:3000` in one terminal. Ctrl+C stops both.

- UI: `http://localhost:3000`
- API: `http://localhost:8000` · docs: `http://localhost:8000/docs`

### Run separately (optional)

```bash
npm run dev:api   # backend only
npm run dev:web   # frontend only
```

## Environment variables

| Location | Variable | Purpose |
|----------|----------|---------|
| `backend/.env` or root `.env` | `DHAN_CLIENT_ID` | Dhan API client id |
| `backend/.env` or root `.env` | `DHAN_PIN` | 6-digit Dhan PIN (TOTP mint) |
| `backend/.env` or root `.env` | `DHAN_TOTP_SECRET` | TOTP secret from Dhan Web setup |
| `backend/.env` or root `.env` | `DHAN_ACCESS_TOKEN` | Optional bootstrap JWT until first auto-mint |
| `backend/.env` or root `.env` | `CORS_ORIGINS` | Comma-separated allowed origins (default `http://localhost:3000`) |
| `frontend/.env.local` (local) or `frontend/.env` (AWS) | `NEXT_PUBLIC_API_URL` | API base URL (local default `http://localhost:8000`; on AWS set at **image build** via Compose) |
| `frontend/.env.local` / `frontend/.env` | `AUTH_USERNAME` | Login username (server-only) |
| `frontend/.env.local` / `frontend/.env` | `AUTH_PASSWORD` | Login password (server-only) |
| `frontend/.env.local` / `frontend/.env` | `AUTH_SECRET` | Secret for signing session cookies (server-only) |

## Deploy (AWS)

v1 runs **api + worker + frontend + Nginx** on one EC2 instance, with **private RDS Postgres**, in `ap-south-1`. Terraform owns infra; [`deploy/deploy.sh`](deploy/deploy.sh) owns app releases.

**Full runbook:** [`docs/aws-deploy.md`](docs/aws-deploy.md) (prereqs, apply, first deploy, verify, teardown, troubleshooting).  
**Later hardening / HTTPS:** [`docs/aws-ec2-hardening-followup.md`](docs/aws-ec2-hardening-followup.md).

Short path:

```bash
# laptop
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # fill ssh_public_key_path, admin_cidr, db_password
terraform init && terraform plan -out tfplan && terraform apply tfplan
terraform output

# on EC2 (after cloud-init / user_data finishes)
# clone repo into /opt/neev-signals, write backend/.env + frontend/.env, then:
./deploy/deploy.sh
curl -fsS http://<ElasticIP>/health
```

## Timeframes

| Timeframe | Source |
|-----------|--------|
| **15m** | Dhan `interval=15` |
| **1h** | Dhan `interval=60` |
| **4h** | Resampled from 1h into NSE session blocks (09:15–13:15 and 13:15–15:30 IST) |

Default lookback: 30 days (15m), 90 days (1h), 365 days (4h). Longer ranges are fetched in 90-day chunks (Dhan limit).

## Signal logic (NEEV Renko Supertrend)

Port of the Pine Script **NEEV Supertrend** indicator:

- Adaptive ATR brick size and supertrend factor by volatility regime (high / normal / low).
- Simulated Renko close drives band pivots; supertrend line flips trend on breaks.
- **BUY** — trend flips to bullish on the latest **confirmed** bar.
- **SELL** — trend flips to bearish on the latest confirmed bar.
- **HOLD** — no flip on that bar (dashboard also shows current **BULL/BEAR** trend, bars since last flip, and supertrend level).

Settings: ATR length, base factor, auto/manual brick, optional ADX choppy filter.

Implementation: [`backend/src/signals.py`](backend/src/signals.py), indicators: [`backend/src/indicators.py`](backend/src/indicators.py).

## API overview

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/health` | `{ "status": "ok" }` |
| `GET` | `/api/meta/defaults` | Lookbacks, NEEV params, chart bar options |
| `GET` | `/api/instruments?refresh=` | NSE equity list |
| `POST` | `/api/signals` | Body: securities + timeframe/params → `{ "results": [...] }` |
