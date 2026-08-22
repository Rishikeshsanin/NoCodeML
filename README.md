# NoCodeML V3

> A full-stack no-code machine learning workspace for exploring datasets, configuring experiments, comparing models, understanding results, and making predictions without writing ML code.

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-Python_3.11-009688?logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-SQLAlchemy-4169E1?logo=postgresql&logoColor=white)
![Celery](https://img.shields.io/badge/Celery-Redis-37814A?logo=celery&logoColor=white)
![CI](https://img.shields.io/badge/GitHub_Actions-CI-2088FF?logo=githubactions&logoColor=white)

## Release status

NoCodeML V3 is being developed on **`release/v3-revival`**. The original V2 code remains preserved on `main` and the dedicated **`legacy/v2-2026-08-22`** branch until V3 completes production validation.

The V3 branch currently passes automated frontend and backend CI. A public production deployment will be added only after the complete authenticated workflow has been tested end to end.

## Why V3 exists

The earlier project had a substantial React/FastAPI/Celery ML architecture, but several pieces had aged or drifted apart: database migrations were incomplete, frontend/backend training contracts did not match, the AI assistant used an obsolete browser-side provider integration, prediction preprocessing could differ from training preprocessing, deployment configuration was fragile, and several screens still behaved like a student prototype.

V3 keeps the useful architecture and rebuilds the unreliable edges around it.

## What you can do

### 1. Manage datasets

- Upload CSV, Excel (`.xlsx` / `.xls`) and Parquet datasets.
- Stream uploads with a **100 MB server-side limit** instead of buffering unbounded files.
- Preview rows and inspect metadata before creating experiments.
- Rename and delete user-owned datasets safely.
- Prevent dataset deletion while dependent experiments still exist.
- Store artifacts locally during development or in private S3-compatible object storage in production.

### 2. Understand data before training

The Analysis workspace includes:

- column types and sample values;
- missing-value analysis;
- descriptive statistics;
- correlations;
- histograms, scatter plots, box plots, categorical bar charts and correlation views;
- conservative ID-column detection;
- an **ML Readiness score** based on dataset size, missingness, constant columns and high-cardinality features;
- target suggestions with transparent classification/regression heuristics.

V3 deliberately avoids the old “every unique column is an ID” heuristic so valid continuous features are not silently discarded.

### 3. Use Smart AutoML Setup

Smart Setup can build a strong editable baseline from the dataset:

- infer classification vs regression from the chosen target;
- support categorical targets and low-cardinality numeric labels such as `0/1`;
- exclude likely IDs and unusable columns;
- recommend features;
- choose an appropriate train/test ratio;
- select a comparison set of available models;
- enable explainable expert-system optimization.

Nothing is hidden or locked. Every Smart Setup decision remains visible and editable.

### 4. Train and compare real models

NoCodeML currently exposes eight model choices:

| Task | Models |
| --- | --- |
| Classification | Logistic Regression, Random Forest Classifier, XGBoost Classifier, LightGBM Classifier |
| Regression | Linear Regression, Random Forest Regressor, XGBoost Regressor, LightGBM Regressor |

Training runs are asynchronous through **Celery + Redis**. Each run stores an immutable configuration snapshot, progress, model-level results, timestamps and artifacts.

The V3 worker honors the saved train/test split and random seed, resolves current and legacy hyperparameter shapes safely, and fails the run if every selected model fails instead of reporting a misleading successful completion.

### 5. Keep preprocessing consistent

One of the most important V3 fixes is inference correctness.

Training now builds a fitted scikit-learn pipeline with:

- median imputation for numerical features;
- optional numerical scaling;
- most-frequent imputation for categorical features;
- `OneHotEncoder(handle_unknown="ignore")` for categorical values;
- the trained estimator;
- the fitted target label encoder for classification.

That entire fitted pipeline is persisted with the model. Prediction reuses it directly instead of recreating category mappings from prediction input.

### 6. Interpret results

Each run can show:

- train and test metrics;
- best-model selection;
- classification accuracy, precision, recall, F1 and ROC-AUC where available;
- regression R², MAE, RMSE and MSE;
- cross-validation information;
- confusion matrices;
- feature importance;
- train-vs-test generalization checks;
- expert-optimization rules and final hyperparameters;
- failed-model diagnostics.

A completed run can also export a **sanitized reproducibility JSON report** containing the configuration snapshot and result data without exposing artifact paths or credentials.

### 7. Make predictions

The Prediction workspace supports:

- interactive single-row predictions;
- typed numeric and categorical inputs;
- valid zero-valued inputs;
- classification probabilities and confidence where supported;
- batch CSV prediction up to 100 MB;
- downloadable prediction CSVs;
- authenticated prediction history.

Batch outputs preserve the original input columns and append prediction/confidence fields.

### 8. Ask the Data Science Assistant

The assistant is grounded in the active experiment phase, EDA, configuration, training state and results.

The provider request is made **server-side**. API credentials are never placed in `VITE_*` browser variables. If no AI provider key is configured, the API fails safely and the core ML product continues to work.

## Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│                    React + TypeScript UI                     │
│  Datasets → Analysis → Configure → Train → Results → Predict │
└──────────────────────────────┬───────────────────────────────┘
                               │ authenticated REST
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                         FastAPI API                          │
│ Auth · Datasets · EDA · Experiments · Training · Prediction │
│                    AI Assistant proxy                        │
└───────────────┬───────────────────────┬──────────────────────┘
                │                       │
                ▼                       ▼
     PostgreSQL / SQLAlchemy       Redis task broker
     isolated `nocodeml` schema          │
                │                         ▼
                │                  Celery V3 worker
                │                         │
                └──────────────┬──────────┘
                               ▼
                    ML artifact storage
              local filesystem or private S3
```

## Technology stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, React Router |
| UI | Tailwind CSS, shadcn/ui, Radix UI, Lucide |
| Data visualization | Recharts + Plotly-compatible API data |
| Backend | FastAPI, Pydantic, HTTPX |
| ORM / database | SQLAlchemy 2, PostgreSQL, Alembic |
| Authentication | bcrypt + signed JWT bearer tokens |
| Background training | Celery + Redis |
| ML | scikit-learn, XGBoost, LightGBM |
| Data processing | pandas, NumPy, PyArrow, OpenPyXL |
| Model persistence | joblib + private artifact store abstraction |
| Optional AI | server-side Gemini integration |
| Local runtime | Docker + Docker Compose |
| Quality | TypeScript typecheck, ESLint, pytest, GitHub Actions |

## Database isolation

This repository is registered in the shared Supabase **Project Hub** using:

```text
app slug: nocodeml
schema:   nocodeml
```

NoCodeML application tables must stay inside `nocodeml.*`.

Before database work, contributors/agents should read:

- [`AGENTS.md`](./AGENTS.md)
- [`SUPABASE_HUB_RULES.md`](./SUPABASE_HUB_RULES.md)

The application must not create cross-project foreign keys or read/write another application's schema.

## Database migrations

The repaired V3 Alembic chain is:

```text
000  users
 ↓
001  datasets
 ↓
002  experiments
 ↓
003  training jobs/results/logs
 ↓
004  run-based training
 ↓
005  prediction batches
```

The missing users migration from V2 is restored, and PostgreSQL migration/version state is scoped to the configured NoCodeML schema.

## Local development

### Requirements

- Docker Desktop / Docker Compose
- Node.js 24 recommended for parity with CI
- npm

### Backend

```bash
git clone https://github.com/Rishikeshsanin/NoCodeML.git
cd NoCodeML
git switch release/v3-revival

cd Backend
cp .env.example .env
# Edit .env for your local environment.

docker compose up --build
```

The local Compose stack uses NoCodeML-specific service/container/volume names so it does not collide with other local projects.

Backend endpoints:

```text
API:    http://localhost:8000
Docs:   http://localhost:8000/docs
Health: http://localhost:8000/health
```

### Frontend

```bash
cd Frontend
cp .env.example .env
npm ci
npm run dev
```

Frontend:

```text
http://localhost:5173
```

## Environment variables

### Backend

Use `Backend/.env.example` as the source of truth.

Important production values include:

```env
ENVIRONMENT=production
DATABASE_URL=postgresql+psycopg://...
DB_SCHEMA=nocodeml
CELERY_BROKER_URL=redis://...
CELERY_RESULT_BACKEND=redis://...
SECRET_KEY=<strong-random-server-secret>
BACKEND_CORS_ORIGINS=https://your-frontend.example
GEMINI_API_KEY=<server-side-only-if-used>
GEMINI_MODEL=gemini-3.7-flash
```

Optional private object storage uses the S3-compatible variables documented in the backend environment template.

### Frontend

```env
VITE_API_URL=http://localhost:8000
```

`VITE_*` values are public browser configuration. Never place database passwords, JWT signing secrets or AI provider secrets there.

## API surface

The current V3 workflow is primarily under `/api/v1`:

| Area | Examples |
| --- | --- |
| Auth | `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `GET /api/v1/auth/me` |
| Datasets | `GET/POST /api/v1/datasets/`, `GET /api/v1/datasets/{id}/preview` |
| EDA | `GET /api/v1/datasets/{id}/eda`, `POST /api/v1/datasets/{id}/plot` |
| Experiments | `GET/POST /api/v1/experiments/`, `PUT /api/v1/experiments/{id}` |
| Models | `GET /api/v1/models`, `GET /api/v1/models/{task_type}` |
| Training runs | `POST /api/v1/training/experiments/{id}/runs`, `GET /api/v1/training/runs/{run_id}` |
| Predictions | `POST /api/v1/predictions/experiments/{id}/predict/single`, batch/history/download routes |
| AI assistant | `POST /api/v1/assistant/chat` |

FastAPI exposes the complete interactive schema at `/docs` while the backend is running.

## Automated validation

GitHub Actions runs on the release branch and pull requests.

Frontend checks:

```text
npm ci
TypeScript typecheck
Vite production build
ESLint
npm critical-vulnerability audit
```

Backend checks:

```text
Python compile
Alembic history validation
pytest smoke + ML pipeline + worker-config + EDA regression tests
```

The ML tests include mixed numeric/categorical classification and regression, persisted preprocessing, unseen categories at inference, numeric `0/1` classification labels, train/test split semantics and conservative ID detection.

## Security / reliability decisions in V3

- Production startup rejects the default JWT signing key.
- Production PostgreSQL is restricted to `DB_SCHEMA=nocodeml`.
- User emails are normalized before registration/login.
- Duplicate registration races return a controlled conflict.
- Passwords are bounded to bcrypt's supported byte length.
- Dataset and experiment queries are ownership-scoped.
- Dataset filenames do not control server filesystem paths.
- AI credentials remain server-side.
- Model artifacts reuse the exact fitted training preprocessing at inference.
- Training config snapshots are immutable per run.
- Object-storage exports use private artifacts/presigned access rather than public buckets.

## Repository branches

| Branch | Purpose |
| --- | --- |
| `main` | Original V2 state until V3 release is approved |
| `legacy/v2-2026-08-22` | Explicit permanent V2 recovery branch |
| `release/v3-revival` | Active V3 development and validation |

V3 will merge into `main` only after production environment configuration and the complete end-to-end user journey pass.

## Current V3 validation checklist

- [x] Preserve legacy release
- [x] Isolate Supabase schema
- [x] Repair migration chain
- [x] Repair training status contract
- [x] Persist fitted preprocessing with models
- [x] Smart AutoML setup
- [x] ML readiness analysis
- [x] Responsive V3 UI pass
- [x] Server-side AI assistant
- [x] Single + batch prediction hardening
- [x] Reproducibility report export
- [x] Automated frontend/backend CI
- [x] Real ML pipeline regression tests
- [ ] Configure production backend secrets/services
- [ ] Deploy V3 preview
- [ ] Execute authenticated end-to-end classification test
- [ ] Execute authenticated end-to-end regression test
- [ ] Mobile + desktop production QA
- [ ] Merge V3 to `main`
- [ ] Tag `v3.0.0`

## Project philosophy

**Quality > quantity.**

NoCodeML V3 is intentionally focused on a coherent, explainable ML workflow rather than adding unrelated AI features. Smart automation should reduce repetitive setup while keeping the model, features, split, metrics and optimization decisions visible to the user.
