# Live reading positions

Readers can return to live coverage and distinguish new posts from earlier
coverage. The website stores progress in the browser's `localStorage`. No
cookie, account or server-side visit history is required.

## Behavior

- The beginning of a post must stay visible for three continuous seconds in
  the active tab. Scrolling it out of view, hiding the page or losing focus
  resets the timer. The start of a tall card can qualify on a small phone.
- The newest qualifying timestamp becomes the saved position. It also covers
  all earlier posts, including skipped posts; this is not a record of each
  individually read post. A later view of an older post cannot move it back.
- On a return visit, posts up to the saved position use static muted styling.
  Text stays readable, links remain active, and media stays at normal opacity.
  Later posts keep their normal appearance.
- The muted boundary stays fixed for the visit. Viewing posts updates only the
  saved position for the next visit. **Mark read** immediately saves the newest
  loaded post and updates the current boundary.
- A first visit has no muted posts. Loading posts alone does not mark them read.
  The existing unread badge still starts counting new arrivals after that load.
- On a return visit, the page scrolls once to the beginning of the newest post,
  below the sticky header. Wheel, touch, keyboard or scrollbar input during
  loading cancels the jump. Manual input also stops later image corrections.
- A link with a post fragment, such as `/#post-<rkey>`, takes priority. An unknown
  fragment does not send the reader to a different post.
- Returning to an already-open tab or receiving new posts does not trigger
  another jump. Browser Back from the page cache starts a fresh visit and fetch.
- The full thread AT URI identifies the event, including the author's DID.
  Progress persists across days and coverage restarts of that same thread.
  Other threads and devices have separate progress.
- Archive reading behavior stays unchanged. Live read tracking stops after the
  live page detects that coverage has ended or another thread has started.

## Storage and compatibility

Live progress uses `chw-lastread-<full-thread-URI>`. A separate
`chw-visited-<full-thread-URI>` marker distinguishes returns even if no post
qualified during the first visit.

Legacy live records use only a root rkey. The new feature leaves those records
intact but does not reuse them: they do not identify the author or prove a
three-second view. The first visit after this change starts fresh. Archive
records continue to use their existing keys.

If storage is blocked or full, coverage remains usable without persistent
progress. If IntersectionObserver is unavailable, posts do not automatically
qualify. **Mark read** still works where the unread badge is available.

## Validation

Run `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build`.
Tests cover interrupted timers, focus and visibility changes, frozen boundaries,
thread identity, storage failures, direct links, manual scrolling, browser Back,
React Strict Mode, and the existing archive observer.

The production build also passed a local Chromium check with fixture coverage
and a phone-sized viewport. That check used native IntersectionObserver for a
tall post, verified the three-second timer, and checked light and dark styling.
It also verified return scrolling, direct links and cancellation during loading.
Full lint still reports the existing `ArchiveViewer` state-in-effect error.
