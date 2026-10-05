# Dhan Signals

Monorepo for NSE equity **NEEV AI Renko Supertrend** signals: FastAPI backend + Next.js frontend.

Search and multi-select NSE equities, fetch intraday candles from Dhan (15m, 1h, 4h), and show signals with charts and responsive cards.

## Structure

```
dhan-signals/
├── backend/          # FastAPI API (uvicorn)
│   ├── app/          # routes, schemas, services
│   ├── src/          # domain: Dhan client, indicators, signals, instruments
│   └── data/         # cached security master CSV
├── frontend/         # Next.js 15 UI
└── render.yaml       # Render deploy for the API
```

## Local setup

One-time:

```bash
cd ~/Documents/dhan-signals
python3 -m venv .venv
source .venv/bin/activate
npm install                    # root helper (concurrently)
npm run install:all            # backend pip + frontend npm
cp backend/.env.example backend/.env   # or use root .env
```

Edit `backend/.env` (or root `.env`) with your Dhan Client ID and Access Token from the [DhanHQ developer portal](https://dhanhq.co/). The API loads `backend/.env` first, then the parent repo `.env`.

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
| `backend/.env` or root `.env` | `DHAN_ACCESS_TOKEN` | Dhan API access token |
| `backend/.env` or root `.env` | `CORS_ORIGINS` | Comma-separated allowed origins (default `http://localhost:3000`) |
| `frontend/.env.local` | `NEXT_PUBLIC_API_URL` | Backend base URL (default `http://localhost:8000`) |
| `frontend/.env.local` | `AUTH_USERNAME` | Login username (server-only) |
| `frontend/.env.local` | `AUTH_PASSWORD` | Login password (server-only) |
| `frontend/.env.local` | `AUTH_SECRET` | Secret for signing session cookies (server-only) |

## Deploy

### API — Render

`render.yaml` at the repo root configures a Python web service with `rootDir: backend`.

Set env vars in the Render dashboard:

- `DHAN_CLIENT_ID`
- `DHAN_ACCESS_TOKEN`
- `CORS_ORIGINS` — your Vercel frontend origin(s), e.g. `https://your-app.vercel.app`

### Frontend — Vercel

- **Root Directory:** `frontend`
- **Env:** `NEXT_PUBLIC_API_URL` = your Render API URL (no trailing slash)
- **Env:** `AUTH_USERNAME`, `AUTH_PASSWORD`, `AUTH_SECRET` (server-only login gate)

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
