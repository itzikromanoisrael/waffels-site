# WAFFELS Production Deployment

## Required Environment Variables

Copy `backend/.env.example` to your hosting provider environment settings and replace:

- `PUBLIC_BASE_URL=https://your-domain.co.il`
- `ALLOWED_ORIGINS=https://your-domain.co.il,https://www.your-domain.co.il`
- `ENABLE_HSTS=true`
- `ADMIN_PASSWORD_HASH=...`
- `ADMIN_SESSION_SECRET=...`
- `ADMIN_APPROVAL_CODE=...`
- `GOOGLE_CALENDAR_ID=...`
- `SELF_PING_URL=https://your-domain.co.il/api/health`

Generate an admin password hash locally:

```bash
npm run security:hash-password -- "your strong admin password"
```

Paste the printed `ADMIN_PASSWORD_HASH=...` value into the server environment.

## PM2 On A VPS

```bash
npm install -g pm2
npm install
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

Useful commands:

```bash
npm run pm2:reload
npm run pm2:logs
```

## Pre-flight Checks

```bash
node --check backend/server.js
node --check scripts/hash-admin-password.js
npm start
```

Then verify:

- `https://your-domain.co.il/api/health` returns `{ "ok": true }`.
- `/api/bookings` returns `401` before admin login.
- `admin.html` login works only with the strong password.
- The browser security headers include `Content-Security-Policy`, `X-Frame-Options: DENY`, and `X-Content-Type-Options: nosniff`.

## Notes

- Keep `backend/.env.local` out of public repositories because it contains local secrets.
- Keep real admin passwords, approval codes, Google tokens, Stripe keys, and booking data only in the hosting provider environment/data store.
- Use HTTPS only in production.
- The site uses inline CSS/JS, so the CSP currently allows `'unsafe-inline'`. This keeps the existing static architecture working. A stricter future hardening step would move inline scripts/styles into files or add nonces.
