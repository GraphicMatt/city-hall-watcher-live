'use client';

import { useState, useEffect, useCallback } from 'react';
import type { BlueskyPost, SessionMetadata } from '@/lib/bluesky';
import PostList from './PostList';
import type { SortOrder } from './PostList';
import MetadataBar from './MetadataBar';
import UnreadBanner from './UnreadBanner';
import { getLastRead, setLastRead, markAllRead } from '@/lib/lastRead';

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

  // Load stored read position on mount (no auto-baseline — archives track reading progress)
  useEffect(() => {
    const stored = getLastRead(slug);
    if (stored) setLastReadAt(stored);
  }, [slug]);

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
    markAllRead(slug, posts);
    const newest = posts.reduce((a, b) => (a.indexedAt > b.indexedAt ? a : b), posts[0]!);
    setLastReadAt(newest.indexedAt);
  }

  const dateStr = startedAt
    ? new Date(startedAt).toLocaleDateString('en-CA', { dateStyle: 'long' })
    : null;

  return (
    <>
      <header className="bg-white dark:bg-[#1a1a1a] border-b border-[#e0e0d8] dark:border-[#2a2a2a] px-6 py-3.5 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-sm font-semibold tracking-tight text-[#1a1a1a] dark:text-[#e8e8e0]">
            CHW Live <span className="text-[#888] font-normal">/ {label}</span>
          </h1>
          {dateStr && <p className="text-xs text-[#aaa] dark:text-[#555] mt-0.5">{dateStr}</p>}
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-[#f0f0ea] text-[#666] dark:bg-[#2a2a2a] dark:text-[#999]">
          Archived
        </span>
      </header>

      {metadata && Object.values(metadata).some(Boolean) && <MetadataBar metadata={metadata} />}
      <UnreadBanner count={unreadCount} order={order} onJump={handleJump} onMarkRead={handleMarkRead} />

      <main className="max-w-[640px] mx-auto px-4 py-6 pb-12">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <span className="text-xs text-[#999] dark:text-[#555]">
            {postCount} {postCount === 1 ? 'post' : 'posts'}
          </span>
          <div className="flex items-center gap-3">
            <select
              value={order}
              onChange={e => setOrder(e.target.value as SortOrder)}
              className="text-xs text-[#999] dark:text-[#555] bg-transparent border-none cursor-pointer p-0 hover:text-[#333] dark:hover:text-[#aaa] outline-none"
            >
              <option value="oldest">Oldest first</option>
              <option value="newest">Newest first</option>
              <option value="most-liked">Most liked</option>
              <option value="most-reposted">Most reposted</option>
            </select>
            <a
              href="/archive"
              className="text-xs text-[#999] dark:text-[#555] hover:text-[#333] dark:hover:text-[#aaa] underline"
            >
              All sessions
            </a>
            <a
              href="/"
              className="text-xs text-[#999] dark:text-[#555] hover:text-[#333] dark:hover:text-[#aaa] underline"
            >
              ← Live
            </a>
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
