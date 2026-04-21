'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchThreadPosts } from '@/lib/bluesky';
import type { BlueskyPost } from '@/lib/bluesky';
import StatusBadge from './StatusBadge';
import type { StatusType } from './StatusBadge';
import PostList from './PostList';

const POLL_INTERVAL = 45_000;

interface LivePollerProps {
  rootUri: string;
  authorDid: string;
}

export default function LivePoller({ rootUri, authorDid }: LivePollerProps) {
  const [status, setStatus] = useState<StatusType>('connecting');
  const [posts, setPosts] = useState<BlueskyPost[]>([]);
  const [newUris, setNewUris] = useState<Set<string>>(new Set());
  const [lastUpdated, setLastUpdated] = useState('');
  const [order, setOrder] = useState<'newest' | 'oldest'>('newest');

  const knownUrisRef = useRef<Set<string>>(new Set());
  const isFirstLoadRef = useRef(true);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const postCount = posts.length;

  return (
    <>
      <header className="bg-white dark:bg-[#1a1a1a] border-b border-[#e0e0d8] dark:border-[#2a2a2a] px-6 py-3.5 flex items-center justify-between sticky top-0 z-10">
        <h1 className="text-sm font-semibold tracking-tight text-[#1a1a1a] dark:text-[#e8e8e0]">
          CHW Live <span className="text-[#888] font-normal">/ Toronto City Council</span>
        </h1>
        <StatusBadge status={status} />
      </header>

      <main className="max-w-[640px] mx-auto px-4 py-6 pb-12">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-3 text-xs text-[#999] dark:text-[#555]">
            {postCount > 0 && <span>{postCount} {postCount === 1 ? 'post' : 'posts'}</span>}
            {lastUpdated && <span>Updated {lastUpdated}</span>}
          </div>
          <button
            onClick={() => setOrder(o => o === 'newest' ? 'oldest' : 'newest')}
            className="text-xs text-[#999] dark:text-[#555] bg-none border-none cursor-pointer underline p-0 hover:text-[#333] dark:hover:text-[#aaa]"
          >
            {order === 'newest' ? 'Newest first' : 'Oldest first'}
          </button>
        </div>
        <PostList posts={posts} newUris={newUris} order={order} />
      </main>
    </>
  );
}
