# Deployment Guide

## Render
1. Create a new Web Service in Render and connect this repository.
2. Use these settings:
   - Build Command: `npm install`
   - Start Command: `node server.js`
3. Add these environment variables:
   - `NODE_ENV=production`
   - `PORT=10000`
   - `MONGODB_URI=<your-mongodb-uri>`
   - `JWT_SECRET=<strong-secret>`
   - `JWT_USER_SECRET=<different-strong-secret>` — required in production; the app refuses to boot without it
   - `ADMIN_PASSWORD_HASH=<bcrypt-hash>`
4. Deploy the service.

## Cloudflare R2 (durable uploads)

Render's free filesystem is ephemeral: uploaded product/review images and payment proofs are lost on every deploy or restart. Configure R2 to persist them (free tier: 10GB).

1. Create a Cloudflare account, open **R2**, and create a bucket (e.g. `joker-store`). Keep it **private** — the app serves proofs through an authenticated admin route.
2. Create an **R2 API token** with **Object Read & Write**, restricted to that bucket. Copy the Account ID, Access Key ID, and Secret Access Key.
3. Add these environment variables in Render (`R2_ENDPOINT` is optional and derived from the account ID):
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET`
4. Deploy. New uploads are stored under `uploads/` (public images) and `payment-proofs/` (private proofs). Existing local files are not migrated automatically.
5. Optional: add a bucket lifecycle rule to delete objects under `payment-proofs/` after 90 days. Do not enable public access to the bucket.

Without these variables the app falls back to local disk storage (suitable only for local development).

## Email (Brevo API)

Render free web services block outbound SMTP ports (25/465/587), so Gmail/Outlook SMTP cannot work on the free plan. Use Brevo's HTTPS API instead (free: 300 emails/day), or move to a paid Render instance if you prefer SMTP.

1. Create a Brevo account and verify a sender address under **Senders** (a custom domain is not required).
2. Create an API key under **SMTP & API → API Keys**.
3. Add these environment variables in Render:
   - `BREVO_API_KEY=<api-key>`
   - `MAIL_FROM=Joker Store <verified-sender@example.com>` — the email inside the brackets must match the verified sender
   - Optional: `MAIL_FROM_NAME=Joker Store`
4. Deploy and request a password reset to confirm delivery.

If `BREVO_API_KEY` is absent, the app falls back to SMTP (`SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`). If neither is configured, emails are skipped and a warning is written to the logs.

## Docker
```bash
docker build -t joker-store .
docker run -p 5850:5850 --env-file .env joker-store
```

For a VPS with automatic HTTPS, use `docker-compose.yml` + `Caddyfile` (see the migration section below).

## Migrating from Render to a private VPS

The repository ships with `Dockerfile`, `docker-compose.yml`, and `Caddyfile`, so moving to private hosting is a configuration change rather than a code change. The domain is no longer hard-coded in application logic: `SITE_URL` drives CSP/CORS/Socket.IO/email links, `APP_URL` drives the Android build, and `DOMAIN` drives Caddy. The only remaining literals are explicit fallback defaults in deployment configs.

### 1. Server requirements
- 2 vCPU / 2 GB RAM / 20 GB SSD (Ubuntu 22.04 or 24.04).
- Docker Engine 24+ with the Compose plugin.
- Only ports 80/443 exposed publicly; SSH key-only and restricted to your IP.
- MongoDB Atlas (recommended) or a managed MongoDB reachable over TLS. Do not rely on the VPS disk alone for the database.

### 2. DNS
- Create an `A` record (and `AAAA` if the server has IPv6) for the domain, pointing to the VPS.
- Keep the Cloudflare proxy **off** (grey cloud) for the first validation so Caddy can obtain a certificate over HTTP-01.
- After HTTPS works, you may enable the proxy (orange cloud); keep `TRUST_CF_CONNECTING_IP=true` in that case.

### 3. Environment
```bash
git clone https://github.com/anann5/joker-store.git
cd joker-store
cp .env.example .env
# edit .env
```
Required values:
- `DOMAIN=<your-domain>` and `SITE_URL=https://<your-domain>`, `APP_URL=https://<your-domain>`
- `NODE_ENV=production`, `MONGODB_URI`, `JWT_SECRET`, `JWT_USER_SECRET`, `ADMIN_PASSWORD_HASH`, `ADMIN_TOTP_SECRET`
- Payment numbers, social links, R2, email, and VAPID variables as needed.

Notes:
- `SITE_URL` is the single source of truth for CSP, CORS, Socket.IO, sitemap, and email links. A wrong value breaks admin sessions, realtime updates, and links — update it immediately on any domain change.
- Set `TRUST_CF_CONNECTING_IP=false` when there is no Cloudflare in front of the server; otherwise a client could spoof `CF-Connecting-IP` and bypass rate limits. Keep it `true` behind Cloudflare/Render.

### 4. Launch
```bash
docker compose up -d --build
docker compose logs -f caddy app
curl -fsS https://<your-domain>/health
```
Caddy obtains and renews TLS certificates automatically. After editing `.env`, run `docker compose up -d` to recreate the containers.

### 5. Uploads and data
- `public/uploads` and `private/uploads` are named volumes, so they survive rebuilds and restarts.
- Keep Cloudflare R2 configured (`R2_*`) as the durable store for images and payment proofs; keep the bucket private.
- Back up MongoDB daily (Atlas snapshots or `mongodump`) and back up both volumes.

### 6. Cutover checklist
1. Deploy to a staging host (`staging.<domain>`) and test: admin login + 2FA, product page, checkout, proof upload, email, Telegram, Socket.IO, and push notifications.
2. Lower the DNS TTL to 300 seconds at least 24 hours before cutover.
3. Point the DNS record to the new server; watch `docker compose logs -f` and `/health` for 24 hours.
4. Keep Render running for one week as a rollback target.
5. Update the GitHub repository variables `SITE_URL` (uptime workflow) and `APP_URL` (Android build), then rebuild the APK.
6. Update `SITE_URL` in every environment that sends email or notifications.

### 7. Rollback
- Repoint DNS to Render (TTL 300s), or stop the Compose stack with `docker compose down`.
- The app performs no database migration; both hosts can read the same MongoDB.

### 8. HSTS preload timing
- Do **not** submit `joker-store.onrender.com`; it is a Render-owned subdomain.
- After the custom domain has served HTTPS reliably for 1–2 weeks (certificate renewals working, no mixed content), submit it at `hstspreload.org`. Removal takes months, so treat it as a one-way step.

### 9. Scaling note
- Rate limits, CSRF tokens, and login lockouts are stored in memory. Keep a single app container (the default in `docker-compose.yml`). Before scaling horizontally, move them to Redis.

## Production checklist
- Use HTTPS only.
- Keep secrets in environment variables.
- Confirm MongoDB connectivity.
- Verify the admin login works after deployment.
