# CHW Live

Live coverage of Toronto City Council meetings at [live.cityhallwatcher.com](https://live.cityhallwatcher.com).

---

## How to use (admin)

### Starting coverage

1. Go to [live.cityhallwatcher.com/admin](https://live.cityhallwatcher.com/admin)
2. Sign in with your password
3. Post your opening Bluesky post as normal
4. Paste the URL of that first post into the **Start coverage** form and click **Go live**
5. The public page immediately shows the live thread — new replies appear automatically every 45 seconds

### Ending coverage

1. Go to `/admin`
2. Click **End coverage**
3. Wait a few seconds while posts are snapshotted — the button shows "Saving archive…"
4. A link to the archived thread appears (e.g. `/april-21-2026`)
5. The public page shows "No live coverage right now" on next refresh

### Archives

Past sessions are listed at [live.cityhallwatcher.com/archive](https://live.cityhallwatcher.com/archive) and individually at URLs like `/april-21-2026`.

Archives are permanent snapshots — posts are preserved even if deleted on Bluesky.

If you forget to click **End coverage**, a safety-net cron job auto-archives any session live for more than 24 hours.

---

## Deployment

### Environment variables (set in Vercel dashboard)

| Variable | Description |
|---|---|
| `ADMIN_PASSWORD` | Your login password for `/admin` |
| `JWT_SECRET` | Random 32+ character string for signing session cookies |
| `CRON_SECRET` | Random string sent by Vercel cron as `Authorization: Bearer ...` |
| `KV_REST_API_URL` | Auto-set when you attach a Vercel KV database |
| `KV_REST_API_TOKEN` | Auto-set when you attach a Vercel KV database |

### First-time setup

1. Push this repo to GitHub
2. Import the project at [vercel.com](https://vercel.com)
3. In the Vercel dashboard: **Storage → Create Database → KV** — attach it to the project (auto-sets KV env vars)
4. Add `ADMIN_PASSWORD`, `JWT_SECRET`, and `CRON_SECRET` in **Settings → Environment Variables**
5. Deploy
6. Add custom domain: point `live.cityhallwatcher.com` DNS to Vercel

### Local development

Create `.env.local` in the project root:

```
ADMIN_PASSWORD=your-password
JWT_SECRET=any-32-char-random-string
CRON_SECRET=any-string
```

KV env vars are optional locally — the app falls back to an in-memory store (resets on server restart).

```bash
npm run dev -- --port 4000
```

### Cron job

The hourly auto-archive cron is configured in `vercel.json`. Vercel Pro plan supports hourly crons. On Hobby, use [cron-job.org](https://cron-job.org) to call `GET /api/cron/archive` hourly with header `Authorization: Bearer {CRON_SECRET}`.
