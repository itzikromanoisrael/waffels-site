# Secrets Are Not Uploaded

This GitHub-ready folder does not include local secrets.

The real values stay only on your computer in:
`WAFFELS_FINAL_RAILWAY/backend/.env.local`

Do not upload that file to GitHub.

When deploying to Railway, add the real values in Railway Variables:

- `ADMIN_PASSWORD_HASH`
- `ADMIN_SESSION_SECRET`
- `ADMIN_APPROVAL_CODE`
- `GOOGLE_CALENDAR_ID`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `PUBLIC_BASE_URL`
- `ALLOWED_ORIGINS`
- `SELF_PING_URL`
