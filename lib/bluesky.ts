export interface BlueskyImage {
  thumb: string;
  fullsize: string;
  alt: string;
}

export interface BlueskyFacetLink {
  $type: 'app.bsky.richtext.facet#link';
  uri: string;
}

export interface BlueskyFacetMention {
  $type: 'app.bsky.richtext.facet#mention';
  did: string;
}

export interface BlueskyFacetTag {
  $type: 'app.bsky.richtext.facet#tag';
  tag: string;
}

export interface BlueskyFacet {
  index: { byteStart: number; byteEnd: number };
  features: Array<BlueskyFacetLink | BlueskyFacetMention | BlueskyFacetTag | { $type: string }>;
}

// A quote-tweet's content, fetched via Twitter's public oEmbed endpoint and
// stored inline so it renders without further network requests.
export interface QuotedPost {
  url: string;
  authorHandle: string;
  authorName: string;
  text: string;
}

// A single recorded Council vote, scraped from the official Minutes
// (see votecard-maker/chw_minutes_scraper.py). `timestamp` is ISO, derived
// from the Minutes' Toronto-local "May-20-2026 10:15 AM" style date.
export interface MinutesVote {
  id: string;
  itemNumber: string;
  itemTitle: string;
  motionLabel: string;
  voteLabel: string;
  result: 'Carried' | 'Lost' | string;
  timestamp: string;
  rawDate: string;
  threshold: string;
  yesCount: number;
  noCount: number;
  absentCount: number;
  yesNames: string[];
  noNames: string[];
  absentNames: string[];
}

// A vote result card attached to a post, replacing a low-res screenshot with
// an accessible, text-based breakdown sourced from the official Minutes.
// Mirrors `quotedPost` as a sibling "card" field on BlueskyPost.
export interface VoteCard {
  vote: MinutesVote;
  // Custom display title, falls back to vote.itemTitle / motionLabel
  title?: string;
  // Mayor's last name for star treatment in councillor pills — stored per
  // card so historical cards stay correct if the mayor changes later.
  mayorLastName?: string;
  // Fullsize URL of the original screenshot, if one was attached to the post.
  screenshotUrl?: string;
}

export interface BlueskyPostRecord {
  text: string;
  facets?: BlueskyFacet[];
  reply?: {
    root: { uri: string };
    parent: { uri: string };
  };
}

export interface BlueskyPost {
  uri: string;
  cid: string;
  author: { did: string; handle: string; displayName?: string };
  record: BlueskyPostRecord;
  embed?: {
    $type: string;
    images?: BlueskyImage[];
  };
  indexedAt: string;
  likeCount?: number;
  repostCount?: number;
  replyCount?: number;
  platform?: 'bluesky' | 'twitter';
  twitterId?: string;
  quotedPost?: QuotedPost;
  voteCard?: VoteCard;
}

export interface VideoSegment {
  id: string;
  youtubeUrl: string;
  startTime: string;  // ISO — when the stream actually started (e.g. 9:30 AM EDT)
  label: string;      // "Day 1", "Day 2", "Evening Session"
}

export interface SessionMetadata {
  meetingTitle?: string;
  agendaUrl?: string;
  minutesUrl?: string;
  previewUrl?: string;
  videoSegments?: VideoSegment[];
  // Which import pipeline produced this session — lets the admin UI surface
  // Twitter-specific maintenance actions (e.g. patching in quote-tweet cards).
  importSource?: 'twitter' | 'bluesky';
}

export function parsePostUrl(url: string): { handle: string; rkey: string } | null {
  const m = url.trim().match(/bsky\.app\/profile\/([^/]+)\/post\/([a-zA-Z0-9]+)/);
  if (!m) return null;
  return { handle: m[1], rkey: m[2] };
}

export async function resolveHandle(handle: string): Promise<string> {
  const r = await fetch(
    `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
  );
  if (!r.ok) throw new Error(`Handle resolve failed (${r.status}): ${await r.text()}`);
  return (await r.json()).did as string;
}

// Fetches a complete historical thread by chaining getPostThread calls.
// The API silently caps each response at ~10 nodes regardless of depth=1000,
// so we re-fetch from the deepest post we found each iteration until stable.
// Use this for historical imports; live threads use fetchThreadPosts instead.
export async function fetchHistoricalThread(rootUri: string, authorDid: string): Promise<BlueskyPost[]> {
  const allPosts = new Map<string, BlueskyPost>();
  const visited = new Set<string>();

  async function fetchFrom(uri: string): Promise<string | null> {
    if (visited.has(uri)) return null;
    visited.add(uri);

    const r = await fetch(
      `https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=1000&parentHeight=0`
    );
    if (!r.ok) return null;
    const data = await r.json();

    let deepest: string | null = null;
    let deepestTime = 0;

    function walk(node: { post?: BlueskyPost; replies?: unknown[] }) {
      if (node.post && node.post.author?.did === authorDid) {
        const parentDid = node.post.record?.reply?.parent?.uri?.split('/')[2];
        if (!parentDid || parentDid === authorDid) {
          allPosts.set(node.post.uri, node.post);
          const t = new Date(node.post.indexedAt).getTime();
          if (t > deepestTime) { deepestTime = t; deepest = node.post.uri; }
        }
      }
      for (const reply of node.replies ?? []) {
        walk(reply as { post?: BlueskyPost; replies?: unknown[] });
      }
    }

    walk(data.thread ?? {});
    return deepest;
  }

  let current: string | null = rootUri;
  // Each iteration yields ~10 posts; 100 iterations covers ~1000-post threads
  for (let i = 0; i < 100 && current; i++) {
    const newDeepest = await fetchFrom(current);
    if (!newDeepest || newDeepest === current) break;
    current = newDeepest;
  }

  return Array.from(allPosts.values()).sort((a, b) => a.indexedAt.localeCompare(b.indexedAt));
}

export async function fetchThreadPosts(rootUri: string, authorDid: string): Promise<BlueskyPost[]> {
  const posts: BlueskyPost[] = [];

  const rootRkey = rootUri.split('/').pop()!;
  const rootUriParam = `at://${authorDid}/app.bsky.feed.post/${rootRkey}`;
  const rootR = await fetch(
    `https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(rootUriParam)}&depth=0&parentHeight=0`
  );
  if (!rootR.ok) throw new Error(`Could not load root post (${rootR.status}): ${await rootR.text()}`);
  const rootData = await rootR.json();
  const rootPost = rootData.thread?.post as BlueskyPost;
  if (!rootPost) throw new Error('Root post not found');
  posts.push(rootPost);
  const rootTimestamp = new Date(rootPost.indexedAt).getTime();

  let cursor: string | undefined;
  let pages = 0;
  const maxPages = 20;

  while (pages < maxPages) {
    const url = new URL('https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed');
    url.searchParams.set('actor', authorDid);
    url.searchParams.set('limit', '100');
    url.searchParams.set('filter', 'posts_with_replies');
    if (cursor) url.searchParams.set('cursor', cursor);

    const r = await fetch(url.toString());
    if (!r.ok) throw new Error(`Feed fetch failed (${r.status}): ${await r.text()}`);
    const data = await r.json();

    let reachedRoot = false;

    for (const item of (data.feed || []) as { post: BlueskyPost }[]) {
      const post = item.post;
      if (!post) continue;
      const postTime = new Date(post.indexedAt).getTime();

      // 2-second buffer for timestamp skew
      if (postTime < rootTimestamp - 2000) {
        reachedRoot = true;
        break;
      }

      const replyRoot = post.record?.reply?.root?.uri;
      if (replyRoot === rootUri && post.author?.did === authorDid) {
        // Skip replies to other users — parent DID is encoded in the AT URI
        // (at://{did}/app.bsky.feed.post/{rkey}). Keep only replies to Matt's
        // own posts so off-topic asides don't appear in the coverage feed.
        const parentDid = post.record.reply!.parent.uri.split('/')[2];
        if (parentDid !== authorDid) continue;

        if (!posts.find(p => p.uri === post.uri)) posts.push(post);
      }
    }

    if (reachedRoot || !data.cursor) break;
    cursor = data.cursor;
    pages++;
  }

  return posts;
}

export function getImages(post: BlueskyPost): BlueskyImage[] {
  if (post.embed?.$type === 'app.bsky.embed.images#view') {
    return post.embed.images || [];
  }
  return [];
}

export type SessionBreak = 'lunch' | 'day';

// Detects a lunch or day break in the gap between two adjacent posts (in
// either order). A break is only reported if the gap is "sustained" —
// long enough that it's unlikely to just be council extending past its
// usual break time by 15-20 minutes.
export function detectBreak(tsA: string, tsB: string): SessionBreak | null {
  const a = new Date(tsA);
  const b = new Date(tsB);
  const [start, end] = a < b ? [a, b] : [b, a];
  const gapMinutes = (end.getTime() - start.getTime()) / 60000;

  const minutesOfDay = (d: Date) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Toronto',
    }).formatToParts(d);
    const hour = Number(parts.find(p => p.type === 'hour')?.value ?? '0');
    const minute = Number(parts.find(p => p.type === 'minute')?.value ?? '0');
    return hour * 60 + minute;
  };

  // Day break: ≥8h with no posts, resuming before ~10:30am — the gap
  // stretched through the overnight lull. The morning resumption time is
  // given some slack since council often starts a few minutes late.
  if (gapMinutes >= 8 * 60 && minutesOfDay(end) <= 10 * 60 + 30) return 'day';

  // Lunch break: ≥45min with no posts, starting between noon and 2pm (council
  // won't break for lunch before noon) and ending after 12:30pm, on the same
  // day.
  const startMin = minutesOfDay(start);
  const endMin = minutesOfDay(end);
  const sameDay = new Intl.DateTimeFormat('en-CA', { dateStyle: 'short', timeZone: 'America/Toronto' }).format(start)
    === new Intl.DateTimeFormat('en-CA', { dateStyle: 'short', timeZone: 'America/Toronto' }).format(end);
  if (gapMinutes >= 45 && sameDay && startMin >= 12 * 60 && startMin < 14 * 60 && endMin > 12 * 60 + 30) return 'lunch';

  return null;
}

export function formatTime(ts: string): string {
  return new Date(ts).toLocaleString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Toronto',
  });
}

// Formats the date(s) a multi-day meeting took place, e.g. "June 24, 2026",
// "June 24 + 25, 2026", "June 24–27, 2026", or "Dec 31, 2026 – Jan 1, 2027".
export function formatMeetingDateRange(startedAt: string, endedAt: string): string {
  const partsFor = (iso: string) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'America/Toronto',
    }).formatToParts(new Date(iso));
    const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
    return { month: get('month'), day: get('day'), year: get('year') };
  };

  const start = partsFor(startedAt);
  const end = partsFor(endedAt);

  if (start.year === end.year && start.month === end.month && start.day === end.day) {
    return `${start.month} ${start.day}, ${start.year}`;
  }
  if (start.year === end.year && start.month === end.month) {
    const sep = Number(end.day) - Number(start.day) === 1 ? ' + ' : '–';
    return `${start.month} ${start.day}${sep}${end.day}, ${start.year}`;
  }
  if (start.year === end.year) {
    return `${start.month} ${start.day} – ${end.month} ${end.day}, ${start.year}`;
  }
  return `${start.month} ${start.day}, ${start.year} – ${end.month} ${end.day}, ${end.year}`;
}

export function extractYoutubeVideoId(url: string): string | null {
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const m = url.match(pattern);
    if (m) return m[1]!;
  }
  return null;
}

export function formatYoutubeOffset(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function getYoutubeTimestampUrl(
  post: BlueskyPost,
  segments: VideoSegment[],
): { url: string; offsetSeconds: number; segment: VideoSegment } | null {
  if (!segments.length) return null;

  const postTime = new Date(post.indexedAt).getTime();
  const sorted = [...segments].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );

  // Use the most recent segment whose startTime is before this post;
  // fall back to the first segment if the post predates all segments.
  let active = sorted[0]!;
  for (const seg of sorted) {
    if (new Date(seg.startTime).getTime() <= postTime) active = seg;
  }

  const segStart = new Date(active.startTime).getTime();
  const offsetSeconds = Math.max(0, Math.floor((postTime - segStart) / 1000) - 60);
  const videoId = extractYoutubeVideoId(active.youtubeUrl);
  if (!videoId) return null;

  return {
    url: `https://www.youtube.com/watch?v=${videoId}&t=${offsetSeconds}`,
    offsetSeconds,
    segment: active,
  };
}

// Convert a Toronto local time on a given date to a UTC ISO string.
// Probes at noon UTC (well clear of any 2 AM DST transition) to find the
// exact UTC offset in effect on that date, then applies it to the target time.
function torontoTimeToISO(dateStr: string, localHour: number, localMinute: number): string {
  const probe = new Date(`${dateStr}T12:00:00.000Z`);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(probe);
  const torontoHourAtNoon = parseInt(parts.find(p => p.type === 'hour')?.value ?? '12', 10);
  // offsetHours is negative west of UTC (e.g. -4 EDT, -5 EST)
  const offsetHours = torontoHourAtNoon - 12;
  return new Date(Date.UTC(
    parseInt(dateStr.slice(0, 4), 10),
    parseInt(dateStr.slice(5, 7), 10) - 1,
    parseInt(dateStr.slice(8, 10), 10),
    localHour - offsetHours,
    localMinute,
    0, 0,
  )).toISOString();
}

// Scans posts (in chronological order) for YouTube links posted by the thread author.
// Returns detected segments with sensible defaults for label + startTime.
// Default times are 9:30 AM and 6:30 PM Toronto local, converted to UTC correctly
// for whichever offset (EDT/EST) is in effect on the meeting date.
export function detectVideoSegments(posts: BlueskyPost[]): VideoSegment[] {
  const seen = new Set<string>();
  const segments: VideoSegment[] = [];
  let dayCount = 0;
  let eveningCount = 0;

  const sorted = [...posts].sort(
    (a, b) => new Date(a.indexedAt).getTime() - new Date(b.indexedAt).getTime(),
  );

  for (const post of sorted) {
    for (const facet of post.record?.facets ?? []) {
      for (const feature of facet.features) {
        if (feature.$type !== 'app.bsky.richtext.facet#link') continue;
        const uri = (feature as BlueskyFacetLink).uri;
        const videoId = extractYoutubeVideoId(uri);
        if (!videoId || seen.has(videoId)) continue;
        seen.add(videoId);

        const postDate = new Date(post.indexedAt);
        const utcHour = postDate.getUTCHours();
        // UTC date string for building the default start time
        const dateStr = post.indexedAt.substring(0, 10);

        const isEvening = utcHour >= 18; // 18:00 UTC ≈ 1–2 PM Toronto — safe threshold
        let startTime: string;
        let label: string;

        if (isEvening) {
          startTime = torontoTimeToISO(dateStr, 18, 30); // 6:30 PM Toronto local
          eveningCount++;
          label = eveningCount > 1 ? `Evening Session ${eveningCount}` : 'Evening Session';
        } else {
          startTime = torontoTimeToISO(dateStr, 9, 30); // 9:30 AM Toronto local
          dayCount++;
          label = `Day ${dayCount}`;
        }

        const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
        segments.push({ id, youtubeUrl: uri, startTime, label });
      }
    }
  }

  return segments;
}
