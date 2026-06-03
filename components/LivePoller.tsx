'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchThreadPosts } from '@/lib/bluesky';
import type { BlueskyPost, SessionMetadata } from '@/lib/bluesky';
import StatusBadge from './StatusBadge';
import type { StatusType } from './StatusBadge';
import PostList from './PostList';
import type { SortOrder } from './PostList';
import MetadataBar from './MetadataBar';
import UnreadBanner from './UnreadBanner';
import { getLastRead, setLastRead, markAllRead } from '@/lib/lastRead';

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
  const [lastReadAt, setLastReadAt] = useState<string | null>(null);
  const [coverageEnded, setCoverageEnded] = useState(false);
  const [archivedSlug, setArchivedSlug] = useState<string | null>(null);

  const knownUrisRef = useRef<Set<string>>(new Set());
  const isFirstLoadRef = useRef(true);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionCheckTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Storage key = rkey of the root post (last segment of the AT URI)
  const storageKey = rootUri.split('/').pop() ?? 'live';

  const fetchAndRender = useCallback(async () => {
    try {
      const fetched = await fetchThreadPosts(rootUri, authorDid);
      const isFirstLoad = isFirstLoadRef.current;
      const newOnes = fetched.filter(p => !knownUrisRef.current.has(p.uri));
      newOnes.forEach(p => knownUrisRef.current.add(p.uri));
      isFirstLoadRef.current = false;

      setPosts(fetched);
      setStatus('live');
      setLastUpdated(
        new Date().toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
      );
      if (!isFirstLoad && newOnes.length > 0) {
        setNewUris(new Set(newOnes.map(p => p.uri)));
      }
      // On first successful load: establish baseline so the banner only shows *new* arrivals.
      if (isFirstLoad && fetched.length > 0) {
        const stored = getLastRead(storageKey);
        if (!stored) {
          const newest = fetched.reduce((a, b) => (a.indexedAt > b.indexedAt ? a : b));
          setLastRead(storageKey, newest.indexedAt);
          setLastReadAt(newest.indexedAt);
        } else {
          setLastReadAt(stored);
        }
      }
    } catch (e) {
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
    fetchAndRender();
    pollTimerRef.current = setInterval(fetchAndRender, POLL_INTERVAL);
    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current); };
  }, [fetchAndRender]);

  // Background session-status check — independent of the Bluesky poll.
  // If the server-side session is ended (e.g. by the cron), stop polling and warn the user.
  useEffect(() => {
    async function checkSession() {
      try {
        const r = await fetch('/api/session');
        const session = await r.json();
        if (!session || session.status === 'ended') {
          setCoverageEnded(true);
          setArchivedSlug(session?.archivedSlug && session.archivedSlug !== '__archiving__'
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const postCount = posts.length;

  // Unread tracking
  const unreadCount = lastReadAt
    ? posts.filter(p => p.indexedAt > lastReadAt).length
    : 0;

  const firstUnreadUri = lastReadAt
    ? [...posts]
        .sort((a, b) => a.indexedAt.localeCompare(b.indexedAt))
        .find(p => p.indexedAt > lastReadAt)?.uri ?? null
    : null;

  const handlePostSeen = useCallback((indexedAt: string) => {
    setLastReadAt(prev => {
      if (!prev || indexedAt > prev) {
        setLastRead(storageKey, indexedAt);
        return indexedAt;
      }
      return prev;
    });
  }, [storageKey]);

  function handleJump() {
    if (order !== 'oldest') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (firstUnreadUri) {
      const els = document.querySelectorAll('[data-post-uri]');
      for (const el of els) {
        if (el.getAttribute('data-post-uri') === firstUnreadUri) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          break;
        }
      }
    }
  }

  function handleMarkRead() {
    markAllRead(storageKey, posts);
    const newest = posts.reduce((a, b) => (a.indexedAt > b.indexedAt ? a : b), posts[0]!);
    setLastReadAt(newest.indexedAt);
  }

  return (
    <>
      <header className="bg-white dark:bg-[#1a1a1a] border-b border-[#e0e0d8] dark:border-[#2a2a2a] px-6 py-3.5 flex items-center justify-between sticky top-0 z-10">
        <h1 className="text-sm font-semibold tracking-tight text-[#1a1a1a] dark:text-[#e8e8e0]">
          CHW Live <span className="text-[#888] font-normal">/ Toronto City Council</span>
        </h1>
        <StatusBadge status={status} />
      </header>

      {metadata && Object.values(metadata).some(Boolean) && <MetadataBar metadata={metadata} />}

      {coverageEnded && (
        <div className="bg-[#fff8e6] dark:bg-[#2a2000] border-b border-[#f0d070]/40 dark:border-[#6a5000]/40 px-6 py-3 text-sm text-[#8a6000] dark:text-[#f0b840]">
          <span className="font-medium">Coverage has ended.</span>{' '}
          {archivedSlug ? (
            <>
              This session has been archived.{' '}
              <a
                href={`/archive/${archivedSlug}`}
                className="underline hover:text-[#5a3a00] dark:hover:text-[#ffd060]"
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
          <div className="flex items-center gap-3 text-xs text-[#999] dark:text-[#555]">
            {postCount > 0 && <span>{postCount} {postCount === 1 ? 'post' : 'posts'}</span>}
            {lastUpdated && <span>Updated {lastUpdated}</span>}
          </div>
          <select
            value={order}
            onChange={e => setOrder(e.target.value as SortOrder)}
            className="text-xs text-[#999] dark:text-[#555] bg-transparent border-none cursor-pointer p-0 hover:text-[#333] dark:hover:text-[#aaa] outline-none"
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
          onPostSeen={handlePostSeen}
        />
      </main>
    </>
  );
}
