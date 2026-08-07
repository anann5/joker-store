# 📋 Agent Guide — JOKER STORE

## Development Commands

```bash
npm start
npm run dev
npm run lint
npm run test
```

## Environment Variables

Create a local copy from [.env.example](.env.example) and fill the missing secrets.

| Variable | Purpose | Required |
|---|---|---|
| `MONGODB_URI` | MongoDB connection string | ✅ |
| `JWT_SECRET` | Signing key for JWT | ✅ |
| `ADMIN_PASSWORD_HASH` | Bcrypt hash for admin login | ✅ |
| `PORT` | Server port | ⚠️ |
| `STRIPE_SECRET_KEY` | Stripe integration | ⚠️ |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | Alerts | ⚠️ |

## Project Structure

```text
server.js            # starts the app and background jobs
app.js               # Express app setup, routes, security middleware
routes/              # router definitions
controllers/         # business logic
middleware/          # auth, security, validation, logging
public/              # storefront frontend
private/             # protected admin dashboard
tests/               # API and security tests
```

## Notes for Agents

- Do not commit secrets from [.env](.env) or [.env.example](.env.example) values.
- Keep frontend code in [public](public) and admin code in [private](private).
- Prefer cookie-based admin auth and avoid exposing tokens in client-side storage.
- Run tests before finishing changes.
