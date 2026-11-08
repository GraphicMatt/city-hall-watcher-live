# CHW Live

Live and archived coverage of Toronto City Council meetings, at
[live.cityhallwatcher.com](https://live.cityhallwatcher.com).

Journalist [Matt Elliott](https://bsky.app/profile/graphicmatt.com) has covered
Toronto City Council meeting-by-meeting since 2011 — first on Twitter, now on
Bluesky. The threads are a genuinely useful public record, and a bad way to read
one: long, hard to follow, and increasingly hard to see at all without an
account on the platform they were posted to.

This app mirrors that coverage onto the open web. During a meeting it follows
the live Bluesky thread and renders it as a readable page. When the meeting
ends, it snapshots the thread into a permanent archive that survives the post
being deleted — or the platform going away. It also backfills the Twitter years,
and matches recorded votes scraped from the City's official Minutes to the posts
describing them.

---

## Running it locally

You need Node 20+. You do **not** need a database, API key, or Vercel account.

```bash
git clone https://github.com/GraphicMatt/city-hall-watcher-live.git
cd city-hall-watcher-live
npm install
```

Create `.env.local` in the project root with three throwaway values:

```
ADMIN_PASSWORD=dev-password
JWT_SECRET=replace-me-with-at-least-32-random-characters
CRON_SECRET=dev-cron-secret
```

Then:

```bash
npm run dev -- --port 4000
```

The public site is at `http://localhost:4000` and the admin pages at
`http://localhost:4000/admin`, where `ADMIN_PASSWORD` gets you in.

**There is no database to set up.** When the `KV_REST_API_*` variables are
absent, `lib/kv.ts` falls back to a JSON file at `.kv-store.json` in the project
root. Sessions, archives, votes, and the quotes index all work against that
file. See [docs/env-reference.md](docs/env-reference.md) for the full list of
variables and which ones matter when.

A fresh clone starts with an empty archive. To get something on screen, sign in
to `/admin` and import a past thread — the Bluesky importer will find real
threads on council meeting dates.

---

## How it works

**Stack.** Next.js 16 (App Router), React 19, Tailwind 4, TypeScript. Vercel KV
for state, Vercel Blob for rehosting dead image links. Deployed on Vercel.

> **Next.js 16 is not the Next.js most references describe.** Conventions moved.
> Most visibly, route middleware lives in **`proxy.ts`** at the project root,
> not `middleware.ts`. Before writing routing or config code, read the relevant
> guide under `node_modules/next/dist/docs/` rather than going from memory. This
> is what `AGENTS.md` is warning about, and it applies to humans too.

**Reading Bluesky needs no credentials.** Everything goes through
`public.api.bsky.app`, the unauthenticated public AppView. The app never posts,
never logs in, and holds no Bluesky token. It only ever reads.

### The live path

1. An admin pastes the URL of the thread's opening post into `/admin` and goes live.
2. That resolves to a `session:active` record in KV — root post URI plus author DID.
3. The public page's `LivePoller` refetches the thread every 45 seconds and renders new replies.
4. Clicking **End coverage** calls `snapshotSession()`, which writes the posts to `archive:posts:{slug}` and prepends an entry to `archive:index`.
5. A cron job at `/api/cron/archive` catches sessions left live by mistake.

Archives are snapshots by design. Once captured, the content no longer depends
on the post still existing upstream.

### The archive path

Historical coverage is imported rather than polled:

- **Bluesky era (2023–).** `/api/archive/import/bluesky/detect` walks the author feed looking for root posts that land on a council meeting date, and proposes them for import.
- **Twitter era (2010–2022).** `data/council-tweets.json` is a preprocessed export. `/api/archive/import/twitter/analyze` groups tweets by council meeting date and reconstructs threads from reply chains. Coverage before about 2017 predates threaded replies, so for those meetings every tweet from the day is merged into one chronological thread.

Council meeting dates come from the City's published schedules in
`council-dates/`, which is what makes "did this post belong to a meeting?"
answerable at all.

### Votes

`votecard-maker/chw_minutes_scraper.py` scrapes recorded votes from the City's
official Minutes into `data/votes/{meetingCode}.json`. `lib/voteMatching.ts`
then pairs each vote with the post describing it, and `VoteCard` renders an
accessible text version of what used to be a screenshot of a vote tally.

### Layout

| Path | What's in it |
|---|---|
| `app/` | Routes — public pages, `/admin`, and the API |
| `lib/` | The actual logic: Bluesky and Twitter adapters, KV access, archiving, vote matching, search |
| `components/` | React components |
| `data/` | Preprocessed tweets and scraped vote records |
| `council-dates/` | City of Toronto meeting schedules, 2010–2026 |
| `scripts/` | One-off preprocessing and backfill scripts |
| `votecard-maker/` | Python scraper for Minutes, plus sample output |
| `docs/` | Admin guide, environment reference, the original project notes, and the single-file proof of concept the app grew out of |
| `proxy.ts` | Auth enforcement for mutating API routes |

### Authentication

There are no user accounts. One shared `ADMIN_PASSWORD` is checked in
constant time, and a successful login sets a signed JWT cookie for 7 days.
`proxy.ts` rejects unauthenticated mutating requests to `/api/session`,
`/api/archive/*`, and `/api/admin/*`. The cron route authenticates separately
with a bearer `CRON_SECRET`.

This is deliberately minimal — it protects one journalist's publishing workflow,
not a multi-tenant service.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues and pull requests are welcome.

Worth knowing up front: this runs as one specific site about one specific city,
and parts of it are hardcoded accordingly — the Bluesky handle, the site name,
the City of Toronto URL patterns in the vote scraper. It is published so the
approach can be read, borrowed, and improved, rather than as a configurable
product. If you want to run it for your own council, open an issue and let's
work out what needs to become configuration.

## Licence

Code is [MIT](LICENSE).

The data is **not** all MIT, and if you are reusing anything from `data/` or
`council-dates/` you need [DATA-LICENSE.md](DATA-LICENSE.md): the council
coverage posts are CC BY-NC 4.0, and the vote records and meeting schedules come
from the City of Toronto under the Open Government Licence – Toronto.

## Operating the live site

See [docs/admin-guide.md](docs/admin-guide.md).
