# NoCodeML V3 Deployment

This release is designed to run without PostgreSQL, Supabase, Redis, Celery or persistent visitor storage.

Recommended college-project deployment:

```text
Vercel Hobby (React frontend)
        ↓ HTTPS
Oracle Cloud Always Free Ampere A1 (FastAPI)
        ↓
RAM-backed temporary session workspaces
```

The backend is ARM64-tested in GitHub Actions before release.

## 1. Backend — Oracle Cloud Always Free

Use an **Ubuntu 24.04 ARM64** VM with the Always Free `VM.Standard.A1.Flex` shape. Keep the total A1 allocation within the Always Free entitlement shown in your Oracle account. The app is intentionally configured for one bounded training worker.

During Oracle account creation you may be asked for identity/payment verification. Do not upgrade the account or create paid resources just for NoCodeML.

### VM networking

Give the instance a public IPv4 address and allow inbound TCP:

```text
22   SSH
80   HTTP (Caddy certificate challenge / redirect)
443  HTTPS
```

Do **not** expose port 8000 publicly. Caddy is the only public entry point.

### Clone and start

```bash
git clone https://github.com/Rishikeshsanin/NoCodeML.git
cd NoCodeML
git switch release/v3-revival
sudo bash deploy/oci/bootstrap-ubuntu.sh
```

The bootstrap script:

- installs Docker and Docker Compose;
- detects the VM's public IPv4 address;
- creates a free `sslip.io` hostname such as `nocodeml-api.203.0.113.10.sslip.io`;
- builds the ARM-compatible backend image;
- starts FastAPI and Caddy;
- obtains HTTPS automatically;
- stores visitor workspaces in tmpfs, not a persistent volume;
- prints the final backend URL.

Check:

```text
https://<generated-host>/health
https://<generated-host>/ready
```

### Optional Gemini assistant

Edit `deploy/oci/.env` on the VM and set:

```env
GEMINI_API_KEY=your_server_side_key
```

Never commit that file. The template is tracked; the real `.env` is ignored.

The core ML workflow works without Gemini.

## 2. Frontend — Vercel Hobby

The repository root contains `vercel.json`, so the GitHub repository can be imported directly without changing the project Root Directory.

Create a **new** Vercel project for `Rishikeshsanin/NoCodeML`. Do not reuse or overwrite another project.

Set this environment variable for Production, Preview and Development as appropriate:

```env
VITE_API_URL=https://<generated-backend-host>
```

Then deploy `release/v3-revival` for the release preview. After validation/merge, production should track `main`.

The build configuration is already versioned:

```text
Install: npm --prefix Frontend ci
Build:   npm --prefix Frontend run build
Output:  Frontend/dist
```

## 3. Tighten backend CORS

The bootstrap starts with `FRONTEND_ORIGIN=*` only so the backend can be smoke-tested before the Vercel URL exists.

As soon as Vercel gives the production URL, edit on the VM:

```env
FRONTEND_ORIGIN=https://your-nocodeml-project.vercel.app
```

Then reload:

```bash
docker compose --env-file deploy/oci/.env -f deploy/oci/docker-compose.yml up -d
```

Verify a browser session can still upload and train. Keeping the exact frontend origin reduces unwanted cross-origin use of the public ML API.

## 4. Production validation

Before merging the release branch, complete both flows from the public Vercel URL.

### Classification

```text
open site
→ upload CSV
→ inspect EDA
→ choose classification target
→ train at least two models
→ compare results
→ single prediction
→ batch prediction
→ download outputs
→ download session ZIP
→ Clear & restart
```

### Regression

Repeat with a numeric continuous target and verify R²/MAE/RMSE results plus prediction output.

Also verify:

- `/login` and `/register` redirect to the guest workspace;
- no persistent `/api/v1/auth`, `/datasets`, `/experiments`, `/training` or `/predictions` API is exposed;
- two temporary sessions cannot access each other's artifacts;
- clearing a session removes its workspace;
- mobile and desktop layouts do not overflow;
- AI assistant fails gracefully if no Gemini key is configured.

## 5. Update deployment

On the VM:

```bash
cd NoCodeML
git fetch origin
git switch main
git pull --ff-only
docker compose --env-file deploy/oci/.env -f deploy/oci/docker-compose.yml up -d --build
```

Vercel can continue auto-deploying from GitHub after `main` becomes the production branch.

## 6. Rollback

Recovery branches are intentionally preserved:

```text
legacy/v2-2026-08-22
checkpoint/v3-rc-persistent-2026-08-22
```

The public V3 release should normally roll back to the previous V3 release commit/deployment rather than restoring persistent visitor storage.

## Data-lifecycle note

Browser close events are not guaranteed to reach a server. NoCodeML therefore combines a close signal with inactivity TTL cleanup. A server/VM/container restart also immediately removes tmpfs visitor workspaces. Caddy's certificate/config volume is persistent, but it contains no user ML data.
