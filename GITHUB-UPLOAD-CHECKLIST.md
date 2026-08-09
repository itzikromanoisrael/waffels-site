# WAFFELS GitHub Upload Checklist

Upload only this folder:
`WAFFELS_FINAL_RAILWAY`

Before uploading:

- Do not upload any `.env` or `.env.local` file.
- Do not upload `backend/data/bookings.json`.
- Keep real admin passwords, approval codes, Google tokens, Stripe keys, and client booking details only in Railway Variables.
- Use `backend/.env.example` only as an example file.
- After uploading to GitHub, connect the repository to Railway and set the variables listed in `RAILWAY-DEPLOY.md`.

Current production start command:

```bash
node ./backend/server.js
```

Railway healthcheck:

```text
/api/health
```
