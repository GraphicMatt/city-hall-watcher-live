'use client';

import { useState, useEffect, useCallback } from 'react';
import type { BlueskyPost, SessionMetadata } from '@/lib/bluesky';
import PostList from './PostList';
import type { SortOrder } from './PostList';
import MetadataBar from './MetadataBar';
import UnreadBanner from './UnreadBanner';
import SiteHeader from './SiteHeader';
import { getLastRead, setLastRead, markAllRead } from '@/lib/lastRead';
import { scrollToPost } from '@/lib/scroll';

interface ArchiveViewerProps {
  posts: BlueskyPost[];
  label: string;
  postCount: number;
  startedAt?: string;
  slug: string;
  metadata?: SessionMetadata;
}

const EMPTY_URIS = new Set<string>();

export default function ArchiveViewer({ posts, label, postCount, startedAt, slug, metadata }: ArchiveViewerProps) {
  const [order, setOrder] = useState<SortOrder>('oldest');
  const [lastReadAt, setLastReadAt] = useState<string | null>(null);
  // Frozen snapshot of lastReadAt taken once when the page loads (or after
  // "Mark read"). Drives the "New" divider and the unread count so they don't
  // creep forward and cause a jumpy re-scroll as the reader scrolls past
  // each post — only a fresh page load or explicit "Mark read" moves it.
  const [baselineReadAt, setBaselineReadAt] = useState<string | null>(null);

  // Load stored read position on mount (no auto-baseline — archives track reading progress)
  useEffect(() => {
    const stored = getLastRead(slug);
    if (stored) {
      setLastReadAt(stored);
      setBaselineReadAt(stored);
    }
  }, [slug]);

  const unreadCount = baselineReadAt
    ? posts.filter(p => p.indexedAt > baselineReadAt).length
    : 0;

  const firstUnreadUri = baselineReadAt
    ? [...posts]
        .sort((a, b) => a.indexedAt.localeCompare(b.indexedAt))
        .find(p => p.indexedAt > baselineReadAt)?.uri ?? null
    : null;

  const handlePostSeen = useCallback((indexedAt: string) => {
    setLastReadAt(prev => {
      if (!prev || indexedAt > prev) {
        setLastRead(slug, indexedAt);
        return indexedAt;
      }
      return prev;
    });
  }, [slug]);

  function handleJump() {
    if (order !== 'oldest') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (firstUnreadUri) {
      scrollToPost(firstUnreadUri);
    }
  }

  function handleMarkRead() {
    markAllRead(slug, posts);
    const newest = posts.reduce((a, b) => (a.indexedAt > b.indexedAt ? a : b), posts[0]!);
    setLastReadAt(newest.indexedAt);
    setBaselineReadAt(newest.indexedAt);
  }

  const dateStr = startedAt
    ? new Date(startedAt).toLocaleDateString('en-CA', { dateStyle: 'long' })
    : null;

  const HeaderRight = (
    <span
      className="inline-flex items-center gap-[7px] rounded-full"
      style={{
        fontFamily: 'var(--font-plex)',
        fontSize: '12px',
        fontWeight: 500,
        letterSpacing: '0.72px',
        background: 'rgba(185,138,46,0.2)',
        color: 'rgb(185,138,46)',
        padding: '5px 11px',
      }}
    >
      <span style={{ background: 'rgb(185,138,46)', width: 6, height: 6, borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />
      ARCHIVED
    </span>
  );

  return (
    <>
      <SiteHeader right={HeaderRight} />

      {metadata && Object.values(metadata).some(Boolean) && <MetadataBar metadata={metadata} />}
      <UnreadBanner count={unreadCount} order={order} onJump={handleJump} onMarkRead={handleMarkRead} />

      <main className="max-w-[640px] mx-auto px-4 py-6 pb-12">
        {/* Session header card */}
        <div
          className="mb-6"
          style={{
            background: 'var(--card)',
            borderRadius: '12px',
            boxShadow: 'var(--card-shadow)',
            padding: '18px 20px 16px 20px',
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <span
              className="inline-flex items-center gap-1.5"
              style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '1.04px', color: 'rgb(185, 138, 46)' }}
            >
              <span style={{ background: 'rgb(185,138,46)', width: 6, height: 6, borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />
              ARCHIVED
            </span>
            {dateStr && (
              <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-secondary)' }}>
                {dateStr}
              </span>
            )}
          </div>
          <h1
            className="text-chw-text"
            style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '-0.24px' }}
          >
            {label}
          </h1>
          <p style={{ fontSize: '12.5px', fontWeight: 400, color: 'var(--text-secondary)', marginTop: '4px' }}>
            {postCount} {postCount === 1 ? 'post' : 'posts'}
          </p>
        </div>

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <select
              value={order}
              onChange={e => setOrder(e.target.value as SortOrder)}
              className="text-xs text-chw-tertiary bg-transparent border-none cursor-pointer p-0 hover:text-chw-text outline-none transition-colors"
            >
              <option value="oldest">Oldest first</option>
              <option value="newest">Newest first</option>
              <option value="most-liked">Most liked</option>
              <option value="most-reposted">Most reposted</option>
            </select>
          </div>
        </div>

        <PostList
          posts={posts}
          newUris={EMPTY_URIS}
          order={order}
          slug={slug}
          videoSegments={metadata?.videoSegments}
          firstUnreadUri={firstUnreadUri}
          onPostSeen={handlePostSeen}
        />
      </main>
    </>
  );
}
