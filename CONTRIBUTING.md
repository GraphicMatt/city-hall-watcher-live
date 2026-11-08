# Contributing

Thanks for looking. This is a small project run by one journalist, so the bar
for a useful contribution is low: a bug report with steps to reproduce is
genuinely helpful.

## Getting set up

See [the README](README.md#running-it-locally). The short version is `npm
install`, three throwaway values in `.env.local`, and `npm run dev -- --port
4000`. You do not need a database or any API credentials, and nothing you run
locally touches the live site.

## Things worth knowing before you write code

**Next.js 16 moved things.** Route middleware is `proxy.ts` at the project
root, not `middleware.ts`. Other conventions have shifted too. Read the
relevant guide under `node_modules/next/dist/docs/` before writing routing or
config code — the version installed here is the authority, not older
references. This is what `AGENTS.md` is about, and it applies to people as well
as agents.

**Bluesky access is read-only and unauthenticated.** All of it goes through
`public.api.bsky.app`. Please keep it that way: the app should never need to log
in or hold a token.

**There are no tests yet.** This is the most obvious gap, and adding coverage
for the pure logic in `lib/` — `voteMatching.ts`, `twitter.ts`,
`councilDates.ts`, `quotes.ts` — would be a very welcome first contribution.
Verify changes by running the dev server and exercising the affected page.

**Run the linter** before opening a pull request:

```bash
npm run lint
```

**Don't commit data or secrets.** `.env*`, `.kv-store.json`, `db-backups/`, and
`bluesky-twitter-archive/` are all gitignored for good reasons. If you
regenerate `data/council-tweets.json`, note that
`scripts/preprocess-tweets.ts` deliberately keeps only tweets posted on a
council meeting date — the filter mirrors the import pipeline exactly, so
widening it adds data the app cannot use.

## Good places to start

The most self-contained parts of the codebase, and the easiest to work on
without understanding the whole thing:

- **Vote matching** (`lib/voteMatching.ts`) — pairing recorded votes from the Minutes with the posts describing them. Self-contained, testable, and imperfect.
- **Quote extraction** (`lib/quotes.ts`) — finding quote-shaped excerpts for the home page. Pure string work.
- **Search** (`lib/search.ts`, `app/search/`) — ranking and highlighting across the archive.
- **Accessibility** — the vote cards exist to replace screenshots with real text. Anywhere that goal isn't met yet is a good issue.

## Pull requests

Keep them focused — one change per pull request. Say what you changed and how
you checked it. If it touches the admin flow or archiving, say what you
exercised locally, since those paths have no automated coverage.

## Licence

Code contributions are under [MIT](LICENSE). Note that the data in `data/` and
`council-dates/` is under different terms — see
[DATA-LICENSE.md](DATA-LICENSE.md).
