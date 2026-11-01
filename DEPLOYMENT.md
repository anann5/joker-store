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

## Production checklist
- Use HTTPS only.
- Keep secrets in environment variables.
- Confirm MongoDB connectivity.
- Verify the admin login works after deployment.
