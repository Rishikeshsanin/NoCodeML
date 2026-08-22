# NoCodeML V3

> Upload a dataset, understand it, train and compare machine-learning models, make predictions, download the outputs, and leave. No account required and no permanent visitor workspace.

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-Python_3.11-009688?logo=fastapi&logoColor=white)
![scikit-learn](https://img.shields.io/badge/scikit--learn-ML-F7931E?logo=scikitlearn&logoColor=white)
![CI](https://img.shields.io/badge/GitHub_Actions-CI-2088FF?logo=githubactions&logoColor=white)

## What V3 is

NoCodeML V3 is a guest-first AutoML workspace built for a simple lifecycle:

```text
Open NoCodeML
    ↓
Upload dataset
    ↓
Explore + ML Readiness
    ↓
Choose target / task / features / models
    ↓
Train + compare
    ↓
Predict
    ↓
Download useful outputs
    ↓
Leave / clear session
    ↓
Temporary workspace removed
```

There is **no mandatory signup or login** in the public V3 workflow.

Visitor datasets, generated models, training state, predictions and exports are **not written to PostgreSQL/Supabase**. They live only inside an isolated temporary session workspace on the backend.

## Privacy-by-lifecycle design

Each browser session receives a cryptographically random token. The raw token is never used as a server directory name; NoCodeML stores the workspace under a SHA-256 digest of the token.

A workspace contains only temporary folders such as:

```text
/tmp/nocodeml-sessions/<hashed-session>/
├── datasets/
├── analysis/
├── training/
├── models/
├── predictions/
└── exports/
```

Cleanup has multiple layers:

- **Clear & restart** deletes the current workspace immediately.
- Browser close/navigation sends a best-effort cleanup signal with a short grace period so normal refreshes do not destroy work accidentally.
- Inactive sessions expire automatically (60 minutes by default).
- A cleanup loop removes expired/orphaned workspaces.
- Active ML jobs hold a temporary cleanup lease so files are not deleted halfway through training.

A browser cannot guarantee that a final network request is delivered when a tab or laptop disappears unexpectedly, so inactivity expiry is the hard cleanup fallback.

## Guided workspace

The production UI is intentionally one coherent flow instead of an account/project CRUD dashboard.

### 1. Data

- CSV, Excel (`.xlsx` / `.xls`) and Parquet uploads.
- Server-side 100 MB upload limit.
- Safe generated storage names; original filenames do not control server paths.
- Row/column counts and metadata.
- Dataset selection within the current temporary session.

### 2. Explore

- ML Readiness score.
- Missing-value analysis.
- Descriptive statistics.
- Conservative ID-column detection.
- Correlations.
- Histogram, scatter, box, bar and correlation visualizations.
- Chart PNG export through Plotly with readable NoCodeML filenames.
- EDA JSON, statistics CSV, missing-values CSV and correlations CSV downloads.

### 3. Configure

NoCodeML provides editable guidance for:

- likely target columns;
- classification vs regression;
- usable features;
- train/test split;
- suitable model defaults.

Users can override those suggestions when domain knowledge says otherwise.

### 4. Train & compare

Eight models are supported:

| Classification | Regression |
| --- | --- |
| Logistic Regression | Linear Regression |
| Random Forest Classifier | Random Forest Regressor |
| XGBoost Classifier | XGBoost Regressor |
| LightGBM Classifier | LightGBM Regressor |

The guest release uses a **bounded in-process training pool** instead of requiring Celery/Redis infrastructure. By default only one training run is active per session and global worker count is intentionally small for safe free/small deployments.

Training writes status, metrics and model artifacts only into the active temporary workspace.

Downloads include:

- model comparison CSV;
- training summary JSON;
- feature importance CSV;
- best fitted model (`.joblib`).

### 5. Correct preprocessing and inference

Training builds a fitted scikit-learn pipeline containing:

- median imputation for numerical features;
- optional numerical scaling;
- most-frequent imputation for categorical features;
- `OneHotEncoder(handle_unknown="ignore")`;
- the estimator;
- fitted classification label decoder where needed.

Prediction reuses that exact fitted pipeline. NoCodeML does **not** create a new category encoder from prediction input.

### 6. Predict & export

- Single-row predictions.
- Classification probability/confidence where available.
- Batch CSV prediction.
- Downloadable prediction CSVs with readable filenames.
- Complete session ZIP export.

Example names:

```text
nocodeml_customer-churn_statistics_20260822-171400.csv
nocodeml_customer-churn_feature-importance_20260822-171400.csv
nocodeml_customer-churn_predictions_20260822-171400.csv
nocodeml_customer-churn_best-model_20260822-171400.joblib
nocodeml_customer-churn_session_20260822-171400.zip
```

## Data Science Assistant

The floating assistant is optional and server-side.

It is authenticated by the temporary session token, not by a user account. The assistant context is deliberately built from **derived workspace information** such as dataset shape, configuration, metrics and model results. Raw uploaded dataset rows are not automatically injected into provider requests.

If `GEMINI_API_KEY` is not configured, the assistant fails safely while the core ML workflow continues to work.

## Architecture

```text
┌────────────────────────────────────────────────────────────┐
│                 React + TypeScript + Vite                 │
│  Data → Explore → Configure → Train → Predict & Export    │
└────────────────────────────┬───────────────────────────────┘
                             │ X-NoCodeML-Session
                             ▼
┌────────────────────────────────────────────────────────────┐
│                         FastAPI                            │
│ Session API · Workspace API · Models · Optional AI proxy  │
└────────────────────────────┬───────────────────────────────┘
                             │
                             ▼
              isolated temporary session folder
            datasets / analysis / models / exports
                             │
                             ▼
                  bounded in-process ML pool

No visitor PostgreSQL database
No visitor account store
No Redis/Celery runtime requirement
No persistent application volume required
```

## Technology stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, React Router |
| UI | Tailwind CSS, shadcn/ui, Radix UI, Lucide |
| Charts | Plotly |
| Backend | FastAPI, Pydantic, HTTPX |
| ML | scikit-learn, XGBoost, LightGBM |
| Data | pandas, NumPy, PyArrow, OpenPyXL |
| Model format | joblib |
| Optional AI | server-side Gemini |
| Local runtime | Docker / Docker Compose |
| Quality | TypeScript, ESLint, pytest, GitHub Actions |

## Supabase / legacy database note

During the V3 revival an isolated `nocodeml` schema was created under the shared Project Hub. It remains documented and isolated, but **the guest-first V3 runtime does not use it for visitor work**.

The project safety documents remain in the repository:

- [`AGENTS.md`](./AGENTS.md)
- [`SUPABASE_HUB_RULES.md`](./SUPABASE_HUB_RULES.md)

Those rules still prohibit cross-project database access. Legacy persistence code is not mounted by the public V3 API; recovery branches preserve the earlier architectures.

## Public API surface

The public release intentionally mounts only non-persistent routes:

| Area | Endpoint examples |
| --- | --- |
| Temporary session | `POST /api/v1/session`, `POST /api/v1/session/heartbeat`, `DELETE /api/v1/session` |
| Temporary datasets | `POST /api/v1/workspace/datasets`, preview / EDA / plot / delete routes |
| Temporary training | `POST /api/v1/workspace/training/runs`, `GET /api/v1/workspace/training/runs/{id}` |
| Prediction | single + batch workspace prediction routes |
| Exports | EDA, training, prediction and complete-session downloads |
| Models | `GET /api/v1/models` |
| Optional AI | `POST /api/v1/assistant/chat` |

Legacy `/auth`, persistent `/datasets`, `/experiments`, persistent `/training` and persistent `/predictions` routes are not mounted in the guest release.

FastAPI documentation is available at `/docs` while the backend is running.

## Local development

### Backend

```bash
git clone https://github.com/Rishikeshsanin/NoCodeML.git
cd NoCodeML/Backend
cp .env.example .env
docker compose up --build
```

Backend:

```text
API:    http://localhost:8000
Docs:   http://localhost:8000/docs
Health: http://localhost:8000/health
Ready:  http://localhost:8000/ready
```

The V3 Compose file runs only the API and uses tmpfs for visitor workspaces. It does not start Postgres, Redis or Celery.

### Frontend

```bash
cd Frontend
cp .env.example .env
npm ci
npm run dev
```

```text
http://localhost:5173
```

Frontend environment:

```env
VITE_API_URL=http://localhost:8000
```

`VITE_*` values are public browser configuration. Never put private provider credentials there.

## Deployment

The versioned zero-cost production path uses **Vercel Hobby for the React frontend** and an **Oracle Cloud Always Free Ampere A1 VM for the FastAPI/ML backend**, with Caddy HTTPS and tmpfs visitor workspaces.

See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for the exact production steps, networking rules, Vercel environment, CORS tightening, live E2E checklist and rollback instructions.

Backend production environment is intentionally small:

```env
ENVIRONMENT=production
SESSION_ROOT_DIR=/tmp/nocodeml-sessions
SESSION_TTL_MINUTES=60
SESSION_CLEANUP_INTERVAL_SECONDS=300
SESSION_CLOSE_GRACE_SECONDS=30
WORKSPACE_TRAINING_WORKERS=1
WORKSPACE_MAX_MODELS_PER_RUN=8
BACKEND_CORS_ORIGINS=https://your-frontend.example
GEMINI_API_KEY=optional-server-side-key
GEMINI_MODEL=gemini-3.7-flash
```

No `DATABASE_URL`, PostgreSQL, Supabase, Redis or Celery service is required for the public guest workflow.

## Automated validation

GitHub Actions validates:

### Frontend

```text
npm ci
TypeScript typecheck
Vite production build
ESLint
critical npm vulnerability audit
```

### Backend and deployment

```text
Python compile
full pytest suite
guest-session isolation and cleanup
real classification workflow
real regression workflow
single/batch prediction
export/download behavior
production Docker image
non-root container runtime
/health + /ready + temporary-session container smoke test
ARM64 ML compatibility
Oracle Compose validation
Vercel config validation
```

The real ML tests cover mixed numerical/categorical data, persisted preprocessing, unseen categories, classification and regression.

## Error and resource guardrails

The application includes controlled handling for malformed/empty uploads, unsupported file types, oversized files, invalid targets/features, model failures, prediction schema mismatches, expired sessions and unavailable AI.

Resource defaults are intentionally conservative for public college-project hosting:

- upload size: **100 MB**;
- idle session: **60 minutes**;
- active training runs per session: **1**;
- global training pool: **bounded**;
- models per run: **up to 8**.

## Repository branches

| Branch | Purpose |
| --- | --- |
| `main` | NoCodeML V3 production source |
| `legacy/v2-2026-08-22` | Permanent V2 recovery point |
| `checkpoint/v3-rc-persistent-2026-08-22` | Persistence-based V3 RC recovery point |
| `release/v3-revival` | Full V3 development history / release branch |

## Release checklist

- [x] Preserve V2 and the persistence-based V3 checkpoint
- [x] Repair ML preprocessing/inference correctness
- [x] ML Readiness + Smart target/task/model guidance
- [x] Anonymous temporary sessions
- [x] Session isolation and automatic cleanup
- [x] Database-free dataset + EDA workflow
- [x] Database-free classification/regression training
- [x] Temporary single + batch prediction
- [x] Download/export engine and readable filenames
- [x] Guest-first routing with no signup wall
- [x] Guest-session AI assistant
- [x] Remove persistent routes from the public API
- [x] Remove Postgres/Redis/Celery from the public runtime architecture
- [x] Green release CI, including production container and ARM64 ML
- [x] Merge NoCodeML 3.0.0 to `main`
- [ ] Production backend deployment
- [ ] Vercel frontend deployment
- [ ] Live classification + regression E2E QA
- [ ] GitHub `v3.0.0` release/tag

## Project philosophy

**Quality > quantity.**

NoCodeML is intentionally a coherent ML utility rather than a collection of unrelated AI features. The product should make the workflow easier without hiding what target, features, model, split and metrics were actually used.
