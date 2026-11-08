# Admin guide

How to operate the live site. This is the day-of-meeting workflow, not
developer setup — for that see the [README](../README.md).

## Starting coverage

1. Go to [live.cityhallwatcher.com/admin](https://live.cityhallwatcher.com/admin)
2. Sign in with your password
3. Post your opening Bluesky post as normal
4. Paste the URL of that first post into the **Start coverage** form and click **Go live**
5. The public page immediately shows the live thread — new replies appear automatically every 45 seconds

## Ending coverage

1. Go to `/admin`
2. Click **End coverage**
3. Wait a few seconds while posts are snapshotted — the button shows "Saving archive…"
4. A link to the archived thread appears (e.g. `/april-21-2026`)
5. The public page shows "No live coverage right now" on next refresh

If you forget to click **End coverage**, a safety-net cron job auto-archives any
session that has been live too long. It archives immediately past a 72-hour
hard ceiling, and after 12 hours it will also archive a session whose most
recent post is more than 4 hours old.

## Archives

Past sessions are listed at
[live.cityhallwatcher.com/archive](https://live.cityhallwatcher.com/archive) and
individually at URLs like `/april-21-2026`.

Archives are permanent snapshots — posts are preserved even if deleted on
Bluesky.

## Vote tagging

`/admin/vote-tagger` lists every archived session with its vote-processing
status, so you can see which meetings still need work. Vote records are scraped
from the City's published Council Minutes and matched to posts from the same
meeting.

## Importing historical coverage

The admin pages can import past threads directly into the archive:

- **Bluesky** (2023 onward) — scans the feed for root posts landing on council
  meeting dates and proposes them as threads to import.
- **Twitter** (2010–2022) — reads `data/council-tweets.json` and groups tweets
  by council meeting date. Pre-2017 coverage predates threaded replies, so for
  those meetings every tweet from the day is merged into one chronological
  thread.

## Deployment

The app runs on Vercel.

1. Attach a KV store: **Storage → Create Database → KV**, which auto-sets the
   two `KV_REST_API_*` variables
2. Set the remaining variables under **Settings → Environment Variables** — see
   [env-reference.md](env-reference.md). Scope the secrets to **Production
   only**.
3. Point `live.cityhallwatcher.com` DNS at Vercel

### Cron

The auto-archive cron is configured in `vercel.json`, currently daily at
midnight. Vercel's Hobby plan limits cron frequency; to run it hourly instead,
either upgrade or use an external scheduler to call
`GET /api/cron/archive` with the header `Authorization: Bearer {CRON_SECRET}`.
