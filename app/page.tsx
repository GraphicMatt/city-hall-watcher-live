import type { Metadata } from 'next';
import { getActiveSession, getArchiveIndex, getArchivePosts } from '@/lib/kv';
import { getNextMeetingDate } from '@/lib/councilDates';
import { decodeHtmlEntities } from '@/lib/twitter';
import LivePoller from '@/components/LivePoller';
import type { ArchiveEntry } from '@/lib/kv';

export const dynamic = 'force-dynamic';

// ── Types ──────────────────────────────────────────────────────────────────

interface QuoteResult {
  text: string;      // full post text — includes attribution context around the quote
  slug: string;
  postId: string;
  sessionLabel: string;
  indexedAt: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const QUOTE_RE = /"([^"]{25,250})"/g;

async function findRandomQuote(sessions: ArchiveEntry[]): Promise<QuoteResult | null> {
  const allPosts = (
    await Promise.all(
      sessions.map(async entry => {
        const posts = await getArchivePosts(entry.slug);
        return (posts ?? []).map(p => ({
          ...p,
          _slug: entry.slug,
          _label: entry.metadata?.meetingTitle || entry.label,
        }));
      })
    )
  ).flat();

  const candidates: QuoteResult[] = [];

  for (const post of allPosts) {
    const text = decodeHtmlEntities(post.record?.text || '');
    QUOTE_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = QUOTE_RE.exec(text)) !== null) {
      const q = match[1].trim();
      if (q.split(/\s+/).length >= 6) {
        candidates.push({
          text,   // full decoded post text — gives attribution context
          slug: post._slug,
          postId: post.uri.split('/').pop()!,
          sessionLabel: post._label,
          indexedAt: post.indexedAt,
        });
        break; // one candidate per post is enough — avoids duplicates when a post has multiple quotes
      }
    }
  }

  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)]!;
}

function todayToronto(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function formatLongDate(isoOrDate: string): string {
  return new Date(isoOrDate + (isoOrDate.length === 10 ? 'T12:00:00Z' : '')).toLocaleDateString('en-CA', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/Toronto',
  });
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', {
    month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/Toronto',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-CA', {
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'America/Toronto',
  });
}

// ── Metadata ───────────────────────────────────────────────────────────────

export async function generateMetadata(): Promise<Metadata> {
  const session = await getActiveSession();
  const isLive = session?.status === 'live';
  return {
    title: isLive ? 'Live — CHW Live' : 'CHW Live — Toronto City Council',
    description: isLive
      ? 'Live coverage of a Toronto City Council meeting by Matt Elliott. Auto-updating.'
      : 'Live coverage of Toronto City Council meetings by Matt Elliott.',
    openGraph: {
      title: isLive ? 'CHW Live — Toronto City Council (Live)' : 'CHW Live — Toronto City Council',
      description: isLive
        ? 'Live coverage of a Toronto City Council meeting by Matt Elliott. Auto-updating.'
        : 'Live coverage of Toronto City Council meetings by Matt Elliott.',
      url: 'https://live.cityhallwatcher.com',
      siteName: 'CHW Live',
    },
  };
}

// ── Page ───────────────────────────────────────────────────────────────────

export default async function Home() {
  const session = await getActiveSession();

  // ── Live coverage — existing behaviour, untouched ─────────────────────
  if (session?.status === 'live') {
    return <LivePoller rootUri={session.rootUri} authorDid={session.authorDid} metadata={session.metadata} />;
  }

  // ── Idle state — fetch all supplementary data in parallel ─────────────
  const index = await getArchiveIndex();
  const sortedByDate = [...index].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const recentSessions = sortedByDate.slice(0, 3);

  // Random quote: try up to 8 random sessions
  const sessionsForQuote = [...index].sort(() => Math.random() - 0.5).slice(0, 8);
  const [quote, nextMeetingInfo] = await Promise.all([
    findRandomQuote(sessionsForQuote),
    Promise.resolve(getNextMeetingDate(todayToronto())),
  ]);

  const isToday = nextMeetingInfo?.date === todayToronto();

  return (
    <>
      <header className="bg-white dark:bg-[#1a1a1a] border-b border-[#e0e0d8] dark:border-[#2a2a2a] px-6 py-3.5 flex items-center justify-between sticky top-0 z-10">
        <h1 className="text-sm font-semibold tracking-tight text-[#1a1a1a] dark:text-[#e8e8e0]">
          CHW Live <span className="text-[#888] font-normal">/ Toronto City Council</span>
        </h1>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-[#f0f0ea] text-[#666] dark:bg-[#2a2a2a] dark:text-[#999]">
          <span className="w-[7px] h-[7px] rounded-full bg-current" />
          No coverage
        </span>
      </header>

      <main className="max-w-[640px] mx-auto px-4 py-8 pb-16 flex flex-col gap-10">

        {/* Intro */}
        <div>
          <p className="text-sm text-[#999] dark:text-[#555]">No live coverage right now.</p>
          <p className="text-xs text-[#bbb] dark:text-[#444] mt-1">
            Check back during a Toronto City Council meeting.
          </p>
        </div>

        {/* ── Recent coverage ───────────────────────────────────────────── */}
        {recentSessions.length > 0 && (
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-xs font-semibold text-[#888] dark:text-[#555] uppercase tracking-wide">
                Recent coverage
              </h2>
              <a
                href="/archive"
                className="text-xs text-[#aaa] dark:text-[#555] hover:text-[#333] dark:hover:text-[#aaa] underline"
              >
                All {index.length} sessions →
              </a>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {recentSessions.map(entry => {
                const title = entry.metadata?.meetingTitle || entry.label;
                return (
                  <a
                    key={entry.slug}
                    href={`/${entry.slug}`}
                    className="group bg-white dark:bg-[#1a1a1a] border border-[#e0e0d8] dark:border-[#2a2a2a] rounded-[10px] px-4 py-3.5 flex flex-col gap-0.5 hover:border-[#bbb] dark:hover:border-[#444] transition-colors"
                  >
                    <p className="text-sm font-medium text-[#1a1a1a] dark:text-[#e8e8e0] group-hover:text-[#1a6bbf] dark:group-hover:text-[#5a9fd4] transition-colors leading-snug">
                      {title}
                    </p>
                    <p className="text-xs text-[#aaa] dark:text-[#555] mt-0.5">
                      {formatShortDate(entry.startedAt)}
                    </p>
                    <p className="text-xs text-[#ccc] dark:text-[#444] mt-0.5">
                      {entry.postCount} {entry.postCount === 1 ? 'post' : 'posts'}
                    </p>
                  </a>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Search ───────────────────────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-semibold text-[#888] dark:text-[#555] uppercase tracking-wide mb-3">
            Search past coverage
          </h2>
          <form action="/search" method="get" className="flex gap-2">
            <input
              type="search"
              name="q"
              placeholder={`Search ${index.length > 0 ? `${index.reduce((s, e) => s + e.postCount, 0).toLocaleString()} posts` : 'past coverage'}…`}
              className="flex-1 text-sm px-4 py-2.5 border border-[#d0d0c8] dark:border-[#333] rounded-xl bg-white dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-[#e8e8e0] placeholder-[#bbb] dark:placeholder-[#444] outline-none focus:border-[#888] dark:focus:border-[#555] transition-colors"
            />
            <button
              type="submit"
              className="px-4 py-2.5 text-sm font-medium rounded-xl bg-[#1a1a1a] dark:bg-[#e8e8e0] text-white dark:text-[#111] hover:bg-[#333] dark:hover:bg-white transition-colors flex-shrink-0"
            >
              Search
            </button>
          </form>
        </section>

        {/* ── Random quote ─────────────────────────────────────────────── */}
        {quote && (
          <section>
            <h2 className="text-xs font-semibold text-[#888] dark:text-[#555] uppercase tracking-wide mb-3">
              From past coverage
            </h2>
            <a
              href={`/${quote.slug}#post-${quote.postId}`}
              className="group block border-l-[3px] border-[#d4b896] dark:border-[#5a3e22] bg-[#faf8f4] dark:bg-[#1c1a14] rounded-r-[10px] px-5 py-4 hover:border-[#b8956e] dark:hover:border-[#7a5a3a] transition-colors"
            >
              <p className="text-sm leading-[1.65] text-[#333] dark:text-[#ccc] whitespace-pre-wrap break-words">
                {quote.text}
              </p>
              <p className="text-xs text-[#aaa] dark:text-[#555] mt-2.5 group-hover:text-[#888] dark:group-hover:text-[#777] transition-colors">
                {quote.sessionLabel} · {formatTime(quote.indexedAt)}, {formatShortDate(quote.indexedAt)} →
              </p>
            </a>
          </section>
        )}

        {/* ── Next meeting ─────────────────────────────────────────────── */}
        {nextMeetingInfo && (
          <section className="border-t border-[#f0f0ea] dark:border-[#222] pt-6">
            <p className="text-xs text-[#bbb] dark:text-[#444]">
              {isToday ? (
                <>
                  <span className="font-medium text-[#2a7a3a] dark:text-[#4caf6a]">
                    City Council meets today
                  </span>
                  {' '}— {formatLongDate(nextMeetingInfo.date)}
                </>
              ) : (
                <>
                  Next City Council meeting:{' '}
                  <span className="text-[#888] dark:text-[#555]">
                    {formatLongDate(nextMeetingInfo.date)}
                  </span>
                </>
              )}
            </p>
          </section>
        )}

      </main>
    </>
  );
}
