# Bonner Hour Dashboard

> [!IMPORTANT]
> **This repository has moved to [Daksh-T/bonner-dashboard](https://github.com/Daksh-T/bonner-dashboard).**
> This copy is archived so existing links and the [live demo](https://bonner-dashboard-demo.onrender.com)
> keep working, but all development, issues, and releases happen in the new repo.

Checkpoint dashboard for Bonner-style service programs: hour progress, risk
status, partner activity, reflection completion, exemptions, exports, and
Slack-ready outreach messages. Runs entirely on your **GivePulse CSV exports**
— locally, with nothing leaving your machine. A first-run wizard walks you
through exporting your data and configuring checkpoints, cohorts, and
reflections.

**🔗 Live demo:** <https://bonner-dashboard-demo.onrender.com> — fabricated
data, free Render tier (first load can take ~a minute while it wakes up).

**📖 New here? Read the [User Guide](user_guide.md)** — it covers every
feature, the full GivePulse export workflow, and step-by-step local setup.

The bundled `csv/*-demo-*.csv`, `exemptions.json`, and `support_tracking.json`
contain fabricated demo records only; they're cleared automatically when you
upload your own CSVs.

## Recent updates

- **Drag & drop CSV upload** in Settings → Data and the onboarding wizard,
  with inline error reporting when a load fails.
- **Demo data cleanup** — demo exemptions/outreach rows are removed as soon as
  you upload real CSVs, and never re-seeded.
- **Robust CSV handling** — exports with missing/renamed columns or no rows in
  the program window no longer crash the load; the reflection/graduation-year
  field pickers always show the columns of the CSVs currently in use.
- Dead code removed; CORS tightened.

## Run it locally

### Prerequisites

- [uv](https://docs.astral.sh/uv/) (Python) and [Bun](https://bun.sh) (frontend)
- …or neither, if you use a packaged release binary (see below)

### Desktop app (one window) — recommended for daily use

```bash
cd frontend && bun install && bun run build   # build the UI once
cd ../backend && uv sync --extra desktop
uv run python desktop.py
```

`pywebview` (in the `desktop` extra) gives a native window; without it the
launcher falls back to your default browser. State persists per-user (see
below), so onboarding runs only on the true first launch.

### Dev mode (hot reload, two servers)

```bash
cd backend && uv sync
cd ../frontend && bun install
cd .. && ./start.sh
```

Backend: `http://127.0.0.1:8000` · Frontend (Vite): `http://127.0.0.1:3000`

### Standalone binary (no Python/Node on the target machine)

`./packaging/build.sh` builds the frontend and packages everything with
PyInstaller into `backend/dist/` (a folder app, plus `BonnerDashboard.app` on
macOS). Run it on each OS you target — or let CI do it: a GitHub Actions
workflow (see `.github/workflows/` once the release PR is merged) builds
macOS/Windows/Linux binaries and attaches them to a GitHub Release whenever a
PR is merged to `main`.

### Where state lives

Settings, exemptions, outreach state, and uploaded CSVs persist in SQLite.
From a source checkout: `backend/bonner.db` + `backend/uploads/`. The
desktop/packaged app uses a per-user app-data dir instead
(`~/Library/Application Support/BonnerDashboard` on macOS,
`%APPDATA%\BonnerDashboard` on Windows, `~/.local/share/BonnerDashboard` on
Linux). Override with `BONNER_DATA_DIR`; other path overrides:
`BONNER_CSV_DIR`, `BONNER_UPLOAD_DIR`, `BONNER_EXEMPTIONS_PATH`,
`BONNER_SUPPORT_SEED_PATH`, `BONNER_FRONTEND_DIST_PATH`.

## Using it as a web app

The same codebase runs as a single-origin web service: the `Dockerfile`
builds the React app and FastAPI serves both the API and the UI.

```bash
docker build -t bonner-dashboard .
docker run -p 10000:10000 bonner-dashboard
```

To host it (Render, Railway, Fly, or any container host):

1. Push this repo to GitHub.
2. On Render, create a **Blueprint** from the repo — `render.yaml` builds the
   root `Dockerfile` and exposes the app at an `onrender.com` URL
   (`/health` is the health check; the app binds `0.0.0.0:$PORT`). The
   blueprint sets `BONNER_DEMO_MODE=1`, which swaps the setup wizard for a
   "this is a demo" popup — remove that env var for a real hosted instance.

**Caveats for web deployment:** the app is single-tenant and has **no
authentication** — anyone with the URL can see member data and change
settings. Keep hosted instances behind an access layer (VPN, Cloudflare
Access, basic-auth proxy) or use only demo data. On free tiers the container
filesystem is ephemeral, so uploads/settings reset on redeploys unless you
attach a persistent disk and point `BONNER_DATA_DIR` at it.

**Developing it as a web app** is the same as dev mode above: FastAPI backend
(`backend/app/` — routers per page, pandas data pipeline in
`backend/app/data/`, runtime config in `settings.py`) and a React 19 + Vite +
Tailwind frontend (`frontend/src/` — one file per page, thin API client in
`api/client.ts`). The Vite dev server proxies `/api` to port 8000.

## Data

Two GivePulse exports drive everything (full walkthrough in the
[User Guide](user_guide.md#getting-your-data-out-of-givepulse)):

- **Users**: Manage → your group → Users → Manage Users → Actions → Export →
  All Data.
- **Impacts**: Impacts → Manage Impacts → refine dates → Actions → Export →
  All Data.

Upload both in **Settings → Data** (click or drag & drop). The newest upload
of each kind wins; demo CSVs are used only until you upload your own.

## Demo notes

- All included emails use `example.edu` / `example.org` domains; every name,
  hour, reflection, and exemption is fabricated.
