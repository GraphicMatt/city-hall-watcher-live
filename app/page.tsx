import type { Metadata } from 'next';
import Image from 'next/image';
import { getActiveSession, getArchiveIndex, getQuotesIndex } from '@/lib/kv';
import { getNextMeetingDate } from '@/lib/councilDates';
import LivePoller from '@/components/LivePoller';
import SiteHeader from '@/components/SiteHeader';
import StatusBadge from '@/components/StatusBadge';
import type { ArchiveEntry } from '@/lib/kv';

export const dynamic = 'force-dynamic';

// ── Types ──────────────────────────────────────────────────────────────────

interface QuoteResult {
  text: string;
  slug: string;
  postId: string;
  sessionLabel: string;
  indexedAt: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function pickRandomQuote(index: ArchiveEntry[]): Promise<QuoteResult | null> {
  const candidates = await getQuotesIndex();
  if (!candidates.length) return null;
  const picked = candidates[Math.floor(Math.random() * candidates.length)]!;
  const entry = index.find(e => e.slug === picked.slug);
  const sessionLabel = entry?.metadata?.meetingTitle || entry?.label || picked.slug;
  return { text: picked.text, slug: picked.slug, postId: picked.postId, sessionLabel, indexedAt: picked.indexedAt };
}

function todayToronto(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Toronto',
  });
}

// "Wed Jun 24" format for the chip
function formatNextMeetingChip(isoOrDate: string): string {
  return new Date(isoOrDate + (isoOrDate.length === 10 ? 'T12:00:00Z' : '')).toLocaleDateString('en-CA', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Toronto',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-CA', {
    hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Toronto',
  });
}

// ── Metadata ───────────────────────────────────────────────────────────────

export async function generateMetadata(): Promise<Metadata> {
  const session = await getActiveSession();
  const isLive = session?.status === 'live';
  const title = isLive ? 'Live — CHW Live' : 'CHW Live — Toronto City Council';
  const ogTitle = isLive ? 'CHW Live — Toronto City Council (Live)' : 'CHW Live — Toronto City Council';
  const description = isLive
    ? 'Live coverage of a Toronto City Council meeting by Matt Elliott. Auto-updating.'
    : 'Live coverage of Toronto City Council meetings by Matt Elliott.';
  return {
    title,
    description,
    openGraph: {
      title: ogTitle,
      description,
      url: 'https://live.cityhallwatcher.com',
      siteName: 'CHW Live',
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description,
    },
  };
}

// ── Page ───────────────────────────────────────────────────────────────────

export default async function Home() {
  const session = await getActiveSession();

  if (session?.status === 'live') {
    return <LivePoller rootUri={session.rootUri} authorDid={session.authorDid} metadata={session.metadata} />;
  }

  const index = await getArchiveIndex();
  const sortedByDate = [...index].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const recentSessions = sortedByDate.slice(0, 3);
  const totalPosts = index.reduce((s, e) => s + e.postCount, 0);

  const [quote, nextMeetingInfo] = await Promise.all([
    pickRandomQuote(index),
    Promise.resolve(getNextMeetingDate(todayToronto())),
  ]);

  const isToday = nextMeetingInfo?.date === todayToronto();

  return (
    <>
      <SiteHeader right={<StatusBadge status="ready" />} />

      <main className="max-w-[640px] mx-auto px-4 pt-12 pb-20 flex flex-col gap-10">

        {/* ── Hero — centered ──────────────────────────────────────────── */}
        <div className="text-center">
          {/* "— OFF AIR —" label */}
          <p
            className="uppercase mb-5"
            style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '1.92px', color: 'var(--text-tertiary)' }}
          >
            — Off Air —
          </p>

          <h2
            className="text-chw-text"
            style={{ fontSize: '32px', fontWeight: 800, letterSpacing: '-0.64px', lineHeight: '35.84px' }}
          >
            The chamber is quiet.
          </h2>

          <p
            className="mx-auto mt-4"
            style={{ fontSize: '16px', lineHeight: '24.8px', color: 'var(--text-secondary)', maxWidth: '420px' }}
          >
            No live coverage right now.
          </p>

          {/* Next meeting chip */}
          {nextMeetingInfo && (
            <div className="flex justify-center" style={{ marginTop: '20px' }}>
              {isToday ? (
                <span className="inline-flex items-center gap-2 text-sm font-medium text-live-red">
                  <span className="w-2 h-2 rounded-full bg-live-red animate-pulse" />
                  City Council meets today
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-2 rounded-full"
                  style={{
                    background: 'var(--bg-pale-blue)',
                    height: '34px',
                    padding: '7px 14px 7px 8px',
                  }}
                >
                  {/* CHW logo icon */}
                  <Image
                    src="/chw-logo.png"
                    alt=""
                    width={18}
                    height={18}
                    style={{ borderRadius: '4px', flexShrink: 0 }}
                  />
                  <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--pale-blue-text-deep)' }}>
                    Next meeting
                  </span>
                  <span style={{ fontSize: '13px', color: 'var(--pale-blue-text)' }}>
                    {formatNextMeetingChip(nextMeetingInfo.date)}
                  </span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Recent coverage ───────────────────────────────────────────── */}
        {recentSessions.length > 0 && (
          <section>
            {/* Section header */}
            <div className="flex items-baseline justify-between mb-3">
              <h3
                className="uppercase"
                style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '1.44px', color: 'var(--text-secondary)' }}
              >
                Recent Coverage
              </h3>
              <a
                href="/archive"
                style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pale-blue-text)' }}
                className="hover:underline"
              >
                All {index.length} sessions →
              </a>
            </div>

            {/* Single white card containing all session rows */}
            <div
              className="overflow-hidden"
              style={{ background: 'var(--card)', borderRadius: '12px' }}
            >
              {recentSessions.map((entry, i) => {
                const title = entry.metadata?.meetingTitle || entry.label;
                return (
                  <a
                    key={entry.slug}
                    href={`/${entry.slug}`}
                    className="flex items-center justify-between hover:bg-bg-secondary transition-colors"
                    style={{
                      padding: '14px 16px',
                      borderTop: i > 0 ? '1px solid var(--card-border)' : 'none',
                    }}
                  >
                    {/* Left: title + date */}
                    <div>
                      <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>
                        {title}
                      </p>
                      <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '3px' }}>
                        {formatShortDate(entry.startedAt)}
                      </p>
                    </div>
                    {/* Right: post count + arrow */}
                    <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {entry.postCount} posts
                      </span>
                      <span style={{ fontSize: '15px', color: 'var(--pale-blue-text)' }}>→</span>
                    </div>
                  </a>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Search ───────────────────────────────────────────────────── */}
        <section>
          <h3
            className="uppercase mb-3"
            style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '1.44px', color: 'var(--text-secondary)' }}
          >
            Search Past Coverage
          </h3>
          <form action="/search" method="get" className="flex gap-2">
            <input
              type="search"
              name="q"
              placeholder={totalPosts > 0 ? `Search ${totalPosts.toLocaleString()} posts…` : 'Search past coverage…'}
              className="flex-1 border border-border rounded-xl bg-card text-chw-text placeholder:text-chw-tertiary outline-none focus:border-chw-secondary transition-colors"
              style={{ fontSize: '15px', padding: '0 16px', height: '48px' }}
            />
            <button
              type="submit"
              className="bg-brand-blue text-white hover:bg-deep-blue transition-colors flex-shrink-0 font-semibold"
              style={{ fontSize: '15px', fontWeight: 600, height: '48px', padding: '0 22px', borderRadius: '10px' }}
            >
              Search
            </button>
          </form>
        </section>

        {/* ── From the archives ────────────────────────────────────────── */}
        {quote && (
          <section>
            <h3
              className="uppercase"
              style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '1.44px', color: 'var(--text-secondary)', marginBottom: '10px' }}
            >
              From the Archives
            </h3>
            <a
              href={`/${quote.slug}#post-${quote.postId}`}
              className="block hover:opacity-90 transition-opacity"
              style={{
                background: 'var(--card)',
                borderRadius: '12px',
                padding: '20px 22px',
                borderTop: '1px solid var(--card-border)',
                borderRight: '1px solid var(--card-border)',
                borderBottom: '1px solid var(--card-border)',
                borderLeft: '3px solid rgb(185, 138, 46)',
                boxShadow: 'var(--card-shadow)',
              }}
            >
              <p
                className="whitespace-pre-wrap break-words"
                style={{
                  fontSize: '19px',
                  fontWeight: 400,
                  letterSpacing: '-0.19px',
                  color: 'var(--text)',
                  lineHeight: '27.55px',
                  marginBottom: '14px',
                }}
              >
                {quote.text}
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {quote.sessionLabel} · {formatTime(quote.indexedAt)}, {formatShortDate(quote.indexedAt)} →
              </p>
            </a>
          </section>
        )}

      </main>
    </>
  );
}
