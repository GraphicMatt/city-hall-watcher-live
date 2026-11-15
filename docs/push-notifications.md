# Thread notifications

Readers opt in to a single Bluesky thread on each browser/device, without an
account. A different thread never inherits subscriptions. Restarting the exact
same AT URI retains subscriptions, but only posts published after coverage
restarts can alert. There are no alerts announcing new events.

The first eligible post can alert on the next poll. Each device/thread then has
a five-minute cooldown. Posts skipped during that cooldown or while reading are
consumed, not queued for a catch-up alert. Subscribing does not alert for old
posts. The sender prefers Bluesky's publication timestamp to its indexing time,
so reindexing an old post cannot trigger an alert.

## Setup

1. Run `npm ci` and `npx web-push generate-vapid-keys --json`. Generate keys once
   and retain them across deployments; rotating them invalidates existing browser
   subscriptions. Never commit the private key or device endpoints.
2. Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` in the server
   environment. The subject must be a real `mailto:` or HTTPS contact address.
   The public key is served at runtime; the private key is never sent to clients.
3. Production requires `KV_REST_API_URL`, `KV_REST_API_TOKEN` and `CRON_SECRET`.
   Keep notification credentials and production KV access out of untrusted preview
   deployments. With no VAPID configuration, the website builds and works with
   notifications disabled.
4. `vercel.json` schedules `/api/cron/push` every minute. This requires a Vercel
   plan supporting that cadence (Hobby only permits daily cron). Alternatively,
   remove that entry and have a trusted scheduler invoke the endpoint every
   minute with `Authorization: Bearer <CRON_SECRET>`. Vercel Cron runs on production
   deployments; it does not schedule local or preview deployments.
5. Serve over HTTPS. On iPhone/iPad (iOS/iPadOS 16.4+), add the site to the Home
   Screen and open the installed app before tapping **Notify me**. Android users
   can opt in through a supported browser. Permission is requested only on a tap.

For local development, the existing JSON storage fallback persists subscriptions
in `.kv-store.json`. Never commit that file: browser endpoints and encryption
material are private. Local cron is manual; invoke `/api/cron/push` using your
local cron secret while testing. Use HTTPS/tunneling and `ALLOWED_DEV_ORIGINS`
when testing on a real phone.

## Implementation

- `web-push` handles VAPID signing, payload encryption and delivery. Zod validates
  requests, including an allowlist of browser push-service hosts to prevent
  anonymous users supplying arbitrary outgoing request destinations.
- Subscriptions live in Redis hashes keyed by a SHA-256 digest of the canonical
  thread AT URI. A random device capability lives in local storage; only its hash
  is stored as the device identifier. There is no reader account or shared
  device-wide opt-out. The API requires the capability and same-origin mutations.
- The once-per-minute poll runs independently of reader tabs. It fetches only the
  currently live thread and rechecks session identity and opt-out before sending.
  A Redis lease prevents overlapping polls, and atomic per-device cooldown leases
  prevent duplicate concurrent sends. Handled-post checkpoints are per device and
  coverage run; another endpoint's failures cannot replay your suppressed posts.
- Focused, visible tabs report presence every 15 seconds and on focus/visibility
  changes. Presence expires after 40 seconds if a tab disappears. Short visibility
  histories prevent a post published while reading from alerting after leaving
  but before the next poll. Multiple tabs are tracked separately.
- Foreground suppression happens **before sending**. iOS requires received
  pushes to display a notification. An already in-flight alert can still appear
  after opening the page; presence suppression is deliberately best effort.
- Pushes expire five minutes after the triggering post, with the remaining TTL
  passed to the push service. This expires queued, undelivered messages; it cannot
  remove displayed cards or guarantee exact end-to-end delivery timing.
- Tags request replacement of displayed notifications and push-service topics
  replace pending messages for the same thread. Android Chrome supports tags;
  iOS replacement remains best effort. OS settings control sound and vibration.
- HTTP 404/410 endpoints are removed. Explicit transient push-service rejections
  can retry on the next poll, within the post's expiry. Ambiguous network timeouts
  retain the cooldown, preferring an occasional missed alert over duplicates.
- A poll has a 60-second execution limit, fetch timeout, bounded delivery batches
  and a 45-second work budget. Large subscriber populations will need queued,
  paginated fan-out; this first implementation targets the initial tester group.
- Notifications open `/thread/<digest>?post=<post-id>`. The route resolves current
  live coverage or its archive, so a later meeting cannot hijack an old alert.
  New archive entries retain `rootUri`; existing historical archives need no
  migration because no notification subscriptions existed for them.
- The service worker handles push and clicks only; it does not intercept page
  requests or cache coverage offline. Its response disables HTTP caching.

## Verification

Run `npm test`, `npx tsc --noEmit`, `npm run build` and `npm run lint`.
Automated checks cover subscription boundaries, retries, cooldowns, foreground
history, restarts, expiry, input validation, permission gestures and notification
clicks. The current upstream `LivePoller` and `ArchiveViewer` have existing
`react-hooks/set-state-in-effect` lint errors, independently reproducible from
the base commit.

Before enabling production, verify on an actual Android device and installed
iPhone app:

1. Enable notifications midway through a live thread: old posts stay silent.
2. Publish a new post while the app is closed: the next poll sends its title and
   excerpt. Tapping opens the correct post. Publish again during the cooldown:
   no alert. After the cooldown, only a subsequent new post alerts.
3. Read the thread visibly: no sends to that device. Switch apps or lock the phone:
   the next eligible post alerts. Leaving does not replay posts seen while reading.
4. Open the thread in two tabs; closing/backgrounding one must not override the
   other focused tab. Another device's subscription remains independent.
5. End coverage, publish during the break, then restart the same thread: the
   subscription remains, break posts stay silent, and a new post alerts. Start a
   different thread: the device is not subscribed to it.
6. Unsubscribe from one thread and confirm another thread's subscription remains.
   Decline/revoke permission and check guidance and expired-endpoint cleanup.
7. Disconnect a phone long enough to exceed expiry: queued pushes should expire.
   Check replacement behavior separately on each OS; iOS may retain multiple cards.
8. Tap an old notification after coverage is archived and a different thread is
   live: it must open the original thread's archived post.

Device/OS delivery behavior is not proven by unit tests or a desktop browser.

## Platform references

- [Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps)
- [web-push library](https://github.com/web-push-libs/web-push)
- [Vercel Cron limits](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing)
- [iPhone/iPad Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- [WebKit user-visible requirement](https://webkit.org/blog/12945/meet-web-push/)
- [WebKit notification tag limitation](https://bugs.webkit.org/show_bug.cgi?id=258922)
- [Web Push TTL semantics](https://www.rfc-editor.org/rfc/rfc8030.html#section-5.2)
