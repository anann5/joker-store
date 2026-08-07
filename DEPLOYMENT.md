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
   - `ADMIN_PASSWORD_HASH=<bcrypt-hash>`
4. Deploy the service.

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
