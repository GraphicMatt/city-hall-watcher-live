'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchThreadPosts } from '@/lib/bluesky';
import type { BlueskyPost, SessionMetadata } from '@/lib/bluesky';
import SiteHeader from './SiteHeader';
import StatusBadge from './StatusBadge';
import type { StatusType } from './StatusBadge';
import PostList from './PostList';
import type { SortOrder } from './PostList';
import MetadataBar from './MetadataBar';
import UnreadBanner from './UnreadBanner';
import { setLastRead, markAllRead } from '@/lib/lastRead';
import { scrollToPost } from '@/lib/scroll';
import { beginLiveVisit } from '@/lib/liveVisit';
import { prepareReturnScroll } from '@/lib/returnScroll';

const POLL_INTERVAL = 45_000;
const SESSION_CHECK_INTERVAL = 5 * 60_000; // 5 minutes

interface LivePollerProps {
  rootUri: string;
  authorDid: string;
  metadata?: SessionMetadata;
}

export default function LivePoller({ rootUri, authorDid, metadata }: LivePollerProps) {
  const [status, setStatus] = useState<StatusType>('connecting');
  const [posts, setPosts] = useState<BlueskyPost[]>([]);
  const [newUris, setNewUris] = useState<Set<string>>(new Set());
  const [lastUpdated, setLastUpdated] = useState('');
  const [order, setOrder] = useState<SortOrder>('newest');
  // Frozen read cutoff taken once when the page loads (or after
  // "Mark read"). Drives the "New" divider and the unread count so they don't
  // creep forward and cause a jumpy re-scroll as the reader scrolls past
  // each post — only a fresh page load or explicit "Mark read" moves it.
  const [baselineReadAt, setBaselineReadAt] = useState<string | null>(null);
  const [fadedThrough, setFadedThrough] = useState<string | null>(null);
  const [visitRevision, setVisitRevision] = useState(0);
  const [coverageEnded, setCoverageEnded] = useState(false);
  const [archivedSlug, setArchivedSlug] = useState<string | null>(null);

  const knownUrisRef = useRef<Set<string>>(new Set());
  const initialVisitRef = useRef<ReturnType<typeof beginLiveVisit> | null>(null);
  const visitRef = useRef<{
    readAt: string | null;
    returning: boolean;
    firstLoad: boolean;
    scroll: ReturnType<typeof prepareReturnScroll>;
  } | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionCheckTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAndRender = useCallback(async () => {
    const visit = visitRef.current;
    if (!visit) return;
    try {
      const fetched = await fetchThreadPosts(rootUri, authorDid);
      if (visitRef.current !== visit) return;
      const isFirstLoad = visit.firstLoad;
      const newOnes = fetched.filter(p => !knownUrisRef.current.has(p.uri));
      newOnes.forEach(p => knownUrisRef.current.add(p.uri));

      setPosts(fetched);
      setStatus('live');
      setLastUpdated(
        new Date().toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
      );
      if (!isFirstLoad && newOnes.length > 0) {
        setNewUris(new Set(newOnes.map(p => p.uri)));
      }
      // Freeze the previous visit's qualified position. A first visit has no
      // faded posts and must not save progress merely because posts loaded.
      if (isFirstLoad && fetched.length > 0) {
        visit.firstLoad = false;
        const newest = fetched.reduce((a, b) => (a.indexedAt > b.indexedAt ? a : b));
        setBaselineReadAt(visit.readAt ?? newest.indexedAt);
        setFadedThrough(visit.readAt);
        setVisitRevision(revision => revision + 1);
      }
    } catch (e) {
      if (visitRef.current !== visit) return;
      setStatus('error');
      console.error(e);
    }
  }, [rootUri, authorDid]);

  // Clear new-post flash after 1.5s
  useEffect(() => {
    if (newUris.size > 0) {
      const t = setTimeout(() => setNewUris(new Set()), 1500);
      return () => clearTimeout(t);
    }
  }, [newUris]);

  useEffect(() => {
    function startVisit() {
      visitRef.current?.scroll.dispose();
      // React Strict Mode repeats effect setup during development. Preserve
      // the original snapshot so that repeat does not become a return visit.
      initialVisitRef.current ??= beginLiveVisit(rootUri);
      visitRef.current = { ...initialVisitRef.current, firstLoad: true, scroll: prepareReturnScroll() };
      knownUrisRef.current.clear();
      void fetchAndRender();
    }
    function restored(event: PageTransitionEvent) {
      // Browser Back can restore the existing document without remounting
      // React. It is a new visit, unlike switching to an already-open tab.
      if (event.persisted) {
        initialVisitRef.current = null;
        startVisit();
      }
    }
    startVisit();
    window.addEventListener('pageshow', restored);
    pollTimerRef.current = setInterval(fetchAndRender, POLL_INTERVAL);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      window.removeEventListener('pageshow', restored);
      visitRef.current?.scroll.dispose();
      visitRef.current = null;
    };
  }, [fetchAndRender, rootUri]);

  useEffect(() => {
    const visit = visitRef.current;
    if (visit && !visit.firstLoad && !coverageEnded) visit.scroll.restore(posts, visit.returning);
  }, [posts, coverageEnded, visitRevision]);

  // Background session-status check — independent of the Bluesky poll.
  // If the server-side session is ended (e.g. by the cron), stop polling and warn the user.
  useEffect(() => {
    async function checkSession() {
      try {
        const r = await fetch('/api/session');
        const session = await r.json();
        if (!session || session.status === 'ended' || session.rootUri !== rootUri) {
          setCoverageEnded(true);
          setArchivedSlug(session?.rootUri === rootUri && session?.archivedSlug && session.archivedSlug !== '__archiving__'
            ? session.archivedSlug
            : null);
          // Stop the Bluesky poll — no point continuing
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          if (sessionCheckTimerRef.current) clearInterval(sessionCheckTimerRef.current);
          setStatus('ended');
        }
      } catch {
        // Network hiccup — try again next interval
      }
    }

    sessionCheckTimerRef.current = setInterval(checkSession, SESSION_CHECK_INTERVAL);
    return () => { if (sessionCheckTimerRef.current) clearInterval(sessionCheckTimerRef.current); };
  }, [rootUri]);

  const postCount = posts.length;

  // Unread tracking — based on the frozen baseline so the divider/badge
  // don't shift as the reader scrolls (see baselineReadAt above).
  const unreadCount = baselineReadAt
    ? posts.filter(p => p.indexedAt > baselineReadAt).length
    : 0;

  const firstUnreadUri = baselineReadAt
    ? [...posts]
        .sort((a, b) => a.indexedAt.localeCompare(b.indexedAt))
        .find(p => p.indexedAt > baselineReadAt)?.uri ?? null
    : null;

  const handlePostSeen = useCallback((indexedAt: string) => {
    setLastRead(rootUri, indexedAt);
  }, [rootUri]);

  function handleJump() {
    if (order !== 'oldest') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (firstUnreadUri) {
      scrollToPost(firstUnreadUri);
    }
  }

  function handleMarkRead() {
    if (!posts.length) return;
    markAllRead(rootUri, posts);
    const newest = posts.reduce((a, b) => (a.indexedAt > b.indexedAt ? a : b), posts[0]!);
    setBaselineReadAt(newest.indexedAt);
    setFadedThrough(newest.indexedAt);
  }

  return (
    <>
      <SiteHeader right={<StatusBadge status={status} />} />

      {metadata && Object.values(metadata).some(Boolean) && <MetadataBar metadata={metadata} />}

      {coverageEnded && (
        <div className="border-b border-border bg-bg-secondary px-5 py-3 text-sm text-chw-secondary">
          <span className="font-medium text-chw-text">Coverage has ended.</span>{' '}
          {archivedSlug ? (
            <>
              This session has been archived.{' '}
              <a
                href={`/archive/${archivedSlug}`}
                className="underline hover:text-chw-text transition-colors"
              >
                View the full archive →
              </a>
            </>
          ) : (
            'The archive will be available shortly.'
          )}
        </div>
      )}

      <UnreadBanner count={unreadCount} order={order} onJump={handleJump} onMarkRead={handleMarkRead} />

      <main className="max-w-[640px] mx-auto px-4 py-6 pb-12">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div
            className="flex items-center gap-3 text-[11px] text-chw-tertiary font-mono"
            style={{ fontFamily: 'var(--font-plex)' }}
          >
            {postCount > 0 && <span>{postCount} {postCount === 1 ? 'post' : 'posts'}</span>}
            {lastUpdated && <span>Updated {lastUpdated}</span>}
          </div>
          <select
            value={order}
            onChange={e => setOrder(e.target.value as SortOrder)}
            className="text-xs text-chw-tertiary bg-transparent border-none cursor-pointer p-0 hover:text-chw-text outline-none transition-colors"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="most-liked">Most liked</option>
            <option value="most-reposted">Most reposted</option>
          </select>
        </div>
        <PostList
          posts={posts}
          newUris={newUris}
          order={order}
          videoSegments={metadata?.videoSegments}
          firstUnreadUri={firstUnreadUri}
          onPostSeen={coverageEnded ? undefined : handlePostSeen}
          liveReadTracking={!coverageEnded}
          fadedThrough={fadedThrough}
        />
      </main>
    </>
  );
}
