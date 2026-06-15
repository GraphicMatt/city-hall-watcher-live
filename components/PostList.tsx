'use client';

import { useRef, useEffect, useMemo } from 'react';
import type { BlueskyPost, SessionBreak, VideoSegment } from '@/lib/bluesky';
import { detectBreak } from '@/lib/bluesky';
import PostCard from './PostCard';

export type SortOrder = 'newest' | 'oldest' | 'most-liked' | 'most-reposted';

interface PostListProps {
  posts: BlueskyPost[];
  newUris: Set<string>;
  order: SortOrder;
  slug?: string;
  videoSegments?: VideoSegment[];
  firstUnreadUri?: string | null;
  onPostSeen?: (indexedAt: string) => void;
}

export default function PostList({
  posts,
  newUris,
  order,
  slug,
  videoSegments,
  firstUnreadUri,
  onPostSeen,
}: PostListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  // Keep the callback in a ref so the observer never goes stale
  const onPostSeenRef = useRef(onPostSeen);
  useEffect(() => { onPostSeenRef.current = onPostSeen; }, [onPostSeen]);

  const sorted = useMemo(() => {
    const arr = [...posts];
    if (order === 'oldest') return arr.sort((a, b) => a.indexedAt.localeCompare(b.indexedAt));
    if (order === 'most-liked') return arr.sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0));
    if (order === 'most-reposted') return arr.sort((a, b) => (b.repostCount ?? 0) - (a.repostCount ?? 0));
    return arr.sort((a, b) => b.indexedAt.localeCompare(a.indexedAt)); // newest
  }, [posts, order]);

  // Lunch/day break markers — only meaningful when adjacent posts in the
  // displayed order are also adjacent in time (chronological orders only).
  const breakMarkers = useMemo(() => {
    const markers = new Map<string, SessionBreak>();
    if (order !== 'oldest' && order !== 'newest') return markers;
    for (let i = 1; i < sorted.length; i++) {
      const breakType = detectBreak(sorted[i - 1]!.indexedAt, sorted[i]!.indexedAt);
      if (breakType) markers.set(sorted[i]!.uri, breakType);
    }
    return markers;
  }, [sorted, order]);

  // Observe every post wrapper; fire onPostSeen when it enters the viewport.
  useEffect(() => {
    if (!listRef.current || !onPostSeenRef.current) return;
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const ts = (entry.target as HTMLElement).dataset.indexedAt;
            if (ts) onPostSeenRef.current?.(ts);
          }
        });
      },
      { threshold: 0.5 },
    );
    listRef.current.querySelectorAll('[data-indexed-at]').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [sorted]); // reconnect whenever the post list changes

  if (!posts.length) {
    return (
      <div className="text-center py-12 text-sm text-[#999] dark:text-[#555]">
        No posts yet — replies will appear here as you add them.
      </div>
    );
  }

  return (
    <div ref={listRef} className="flex flex-col gap-3">
      {sorted.map(post => {
        const showDivider = order === 'oldest' && firstUnreadUri === post.uri;
        const breakType = breakMarkers.get(post.uri);
        return (
          <div key={post.uri} id={`post-${post.uri.split('/').pop()}`} data-indexed-at={post.indexedAt} data-post-uri={post.uri} className="scroll-mt-16">
            {breakType && (
              <div className="flex items-center gap-3 py-2">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[11px] font-medium text-chw-tertiary tracking-wide uppercase">
                  {breakType === 'lunch' ? 'Lunch Break' : 'Day Break'}
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>
            )}
            {showDivider && (
              <div data-unread-marker className="flex items-center gap-3 py-2">
                <div className="flex-1 h-px bg-[#1a6bbf]/25 dark:bg-[#5a9fd4]/25" />
                <span className="text-[11px] font-medium text-[#1a6bbf] dark:text-[#5a9fd4] tracking-wide uppercase">
                  New
                </span>
                <div className="flex-1 h-px bg-[#1a6bbf]/25 dark:bg-[#5a9fd4]/25" />
              </div>
            )}
            <PostCard
              post={post}
              isNew={newUris.has(post.uri)}
              slug={slug}
              videoSegments={videoSegments}
            />
          </div>
        );
      })}
    </div>
  );
}
