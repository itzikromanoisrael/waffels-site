# WAFFELS Railway Deploy

## Railway settings

Create a new Railway project from this repository and keep these settings:

Build: Nixpacks

Start command:

```bash
node ./backend/server.js
```

Healthcheck path:

```text
/api/health
```

## Required variables

Set these in Railway Variables:

```bash
NODE_ENV=production
HOST=0.0.0.0
PUBLIC_BASE_URL=https://your-railway-domain.up.railway.app
ALLOWED_ORIGINS=https://your-railway-domain.up.railway.app
ENABLE_HSTS=true
TRUST_PROXY=true
TIME_ZONE=Asia/Jerusalem
GOOGLE_CALENDAR_ID=your-calendar-id@gmail.com
ADMIN_PASSWORD_HASH=replace-with-generated-hash
ADMIN_SESSION_SECRET=replace-with-64-random-hex-chars
ADMIN_APPROVAL_CODE=replace-with-private-code
SELF_PING_URL=https://your-railway-domain.up.railway.app/api/health
SELF_PING_INTERVAL_MS=600000
```

Railway supplies `PORT` automatically. Do not hard-code a public port.

## Generate admin password hash

Run locally before deploy:

```bash
npm run security:hash-password
```

Copy the generated value into `ADMIN_PASSWORD_HASH`. Keep the real password and generated hash only in Railway Variables, not in GitHub.

## After first deploy

1. Open the Railway temporary domain and verify the homepage.
2. Update `PUBLIC_BASE_URL`, `ALLOWED_ORIGINS`, and `SELF_PING_URL` to the final Railway domain.
3. Test booking, WhatsApp, map, gallery, and admin login.
4. When a custom domain is connected, update those three variables again to the custom domain.
