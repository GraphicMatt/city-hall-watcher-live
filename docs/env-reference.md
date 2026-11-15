# Environment variables

For local development you need the first three variables below,
and they can be any throwaway values — nothing here talks to production.

Put them in `.env.local` in the project root. That file is gitignored.

## Required

| Variable | What it does |
|---|---|
| `ADMIN_PASSWORD` | The password for the `/admin` pages. There are no user accounts — one shared password is the whole auth model. |
| `JWT_SECRET` | Signs the admin session cookie. Any string of 32+ characters. Generate one with `openssl rand -base64 32`. |
| `CRON_SECRET` | Expected as `Authorization: Bearer <value>` on `GET /api/cron/archive` and `GET /api/cron/push`. Needed when running scheduled jobs. |

## Optional locally

| Variable | What it does |
|---|---|
| `KV_REST_API_URL` | Vercel KV endpoint. **Leave unset locally.** |
| `KV_REST_API_TOKEN` | Vercel KV token. **Leave unset locally.** |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage. Used only by the admin tool that rehosts dead TwitPic and Twitter image links. |
| `ALLOWED_DEV_ORIGINS` | Comma-separated extra hostnames allowed to reach `next dev`, e.g. a tunnel for testing on a phone. Dev only. |
| `VAPID_PUBLIC_KEY` | Web Push public application key, returned to browsers by `/api/push`. Generate with `npx web-push generate-vapid-keys --json`. |
| `VAPID_PRIVATE_KEY` | Matching private application key. Server-side only; keep stable across deploys. |
| `VAPID_SUBJECT` | A real `mailto:` contact or HTTPS contact URL for the push service operator. |

Push opt-ins are disabled until all three VAPID variables are present. On
Vercel, durable KV configuration is also required. See
[push setup and verification](push-notifications.md) for scheduling and device tests.

### You do not need a database to run this locally

This is the most useful thing to know as a new contributor. When
`KV_REST_API_URL` and `KV_REST_API_TOKEN` are both absent, `lib/kv.ts`
transparently falls back to a JSON file store at `.kv-store.json` in the
project root (gitignored). Everything — live sessions, the archive, vote
records, the quotes index — works against that file.

So the normal local setup is: set the three required variables, leave the KV
ones commented out, and run the dev server.

In production, the two KV variables are set automatically by Vercel when you
attach a KV store to the project.

## Starter `.env.local`

```
ADMIN_PASSWORD=dev-password
JWT_SECRET=replace-me-with-at-least-32-random-characters
CRON_SECRET=dev-cron-secret
```

## Production

Set all of these in the Vercel dashboard under **Settings → Environment
Variables**. Scope `ADMIN_PASSWORD`, `JWT_SECRET`, `CRON_SECRET` and
`BLOB_READ_WRITE_TOKEN`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` to **Production only** — preview deployments built from
pull requests should never receive them.
