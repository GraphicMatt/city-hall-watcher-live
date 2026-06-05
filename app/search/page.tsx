'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { CorpusPost } from '@/lib/search';

const MAX_RESULTS = 50;
const DEBOUNCE_MS = 200;
const MIN_QUERY_LEN = 2;

// ── Helpers ────────────────────────────────────────────────────────────────

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Return a short window of text around the first match. */
function getSnippet(text: string, query: string, contextBefore = 80, contextAfter = 120): string {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text.length > 200 ? text.slice(0, 200) + '…' : text;
  const start = Math.max(0, idx - contextBefore);
  const end = Math.min(text.length, idx + query.length + contextAfter);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

/** Wrap every occurrence of query in the snippet with a <mark>. */
function Highlighted({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegex(query)})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark
            key={i}
            className="bg-[#fef3c7] dark:bg-[#3a2800] text-[#92400e] dark:text-[#fcd34d] rounded-[3px] px-0.5 not-italic"
          >
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

function formatPostDate(iso: string): string {
  return new Date(iso).toLocaleString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Toronto',
  });
}

function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/Toronto',
  });
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function SearchPage() {
  const [corpus, setCorpus] = useState<CorpusPost[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Load search corpus on mount
  useEffect(() => {
    fetch('/api/search/corpus')
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((data: CorpusPost[]) => setCorpus(data))
      .catch(() => setLoadError(true));
  }, []);

  // Autofocus the input once the corpus is ready
  useEffect(() => {
    if (corpus) inputRef.current?.focus();
  }, [corpus]);

  // Debounce the raw query
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const handleClear = useCallback(() => {
    setQuery('');
    setDebouncedQuery('');
    inputRef.current?.focus();
  }, []);

  // Run search
  const results = useMemo<CorpusPost[] | null>(() => {
    if (!corpus || debouncedQuery.length < MIN_QUERY_LEN) return null;
    const lower = debouncedQuery.toLowerCase();
    return corpus
      .filter(p => p.text.toLowerCase().includes(lower))
      .sort((a, b) => b.indexedAt.localeCompare(a.indexedAt))
      .slice(0, MAX_RESULTS);
  }, [corpus, debouncedQuery]);

  const sessionCount = useMemo(
    () => (corpus ? new Set(corpus.map(p => p.slug)).size : 0),
    [corpus],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <header className="bg-white dark:bg-[#1a1a1a] border-b border-[#e0e0d8] dark:border-[#2a2a2a] px-6 py-3.5 flex items-center justify-between sticky top-0 z-10">
        <h1 className="text-sm font-semibold tracking-tight text-[#1a1a1a] dark:text-[#e8e8e0]">
          CHW Live{' '}
          <span className="text-[#888] font-normal">
            /{' '}
            <a href="/archive" className="hover:underline">Archive</a>
            {' '}/ Search
          </span>
        </h1>
        <a
          href="/"
          className="text-xs text-[#888] hover:text-[#333] dark:hover:text-[#ccc] underline flex-shrink-0"
        >
          ← Live
        </a>
      </header>

      <main className="max-w-[640px] mx-auto px-4 py-8 pb-16">

        {/* Search input */}
        <div className="relative mb-6">
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={corpus ? `Search ${corpus.length.toLocaleString()} posts…` : 'Loading…'}
            disabled={!corpus && !loadError}
            className="w-full text-sm px-4 py-3 pr-10 border border-[#d0d0c8] dark:border-[#333] rounded-xl bg-white dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-[#e8e8e0] placeholder-[#bbb] dark:placeholder-[#444] outline-none focus:border-[#888] dark:focus:border-[#555] transition-colors disabled:opacity-50"
          />
          {query && (
            <button
              onClick={handleClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#bbb] hover:text-[#888] dark:hover:text-[#aaa] text-lg leading-none"
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        {/* Loading / error */}
        {!corpus && !loadError && (
          <p className="text-sm text-[#999] dark:text-[#555] text-center py-12">
            Loading search index…
          </p>
        )}
        {loadError && (
          <p className="text-sm text-[#c0392b] dark:text-[#f08080] text-center py-12">
            Could not load search index — try refreshing.
          </p>
        )}

        {/* Idle state */}
        {corpus && debouncedQuery.length < MIN_QUERY_LEN && (
          <p className="text-xs text-[#bbb] dark:text-[#444] text-center py-8">
            {corpus.length.toLocaleString()} posts indexed across {sessionCount} sessions
          </p>
        )}

        {/* No results */}
        {results?.length === 0 && (
          <p className="text-sm text-[#999] dark:text-[#555] text-center py-12">
            No posts found for <span className="font-medium text-[#666] dark:text-[#888]">&ldquo;{debouncedQuery}&rdquo;</span>
          </p>
        )}

        {/* Results */}
        {results && results.length > 0 && (
          <>
            <p className="text-xs text-[#bbb] dark:text-[#444] mb-4">
              {results.length === MAX_RESULTS
                ? `${MAX_RESULTS}+ results — try a more specific search`
                : `${results.length} ${results.length === 1 ? 'result' : 'results'}`}
            </p>
            <div className="flex flex-col gap-2">
              {results.map(post => {
                const snippet = getSnippet(post.text, debouncedQuery);
                return (
                  <a
                    key={`${post.slug}/${post.postId}`}
                    href={`/${post.slug}/${post.postId}`}
                    className="group bg-white dark:bg-[#1a1a1a] border border-[#e0e0d8] dark:border-[#2a2a2a] rounded-[10px] px-4 py-3.5 flex flex-col gap-1.5 hover:border-[#bbb] dark:hover:border-[#444] transition-colors"
                  >
                    {/* Session context */}
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-xs font-medium text-[#1a6bbf] dark:text-[#5a9fd4] group-hover:underline truncate">
                        {post.sessionLabel}
                      </span>
                      <span className="text-xs text-[#bbb] dark:text-[#444] flex-shrink-0">
                        {formatPostDate(post.indexedAt)}
                      </span>
                    </div>
                    {/* Snippet */}
                    <p className="text-sm text-[#333] dark:text-[#ccc] leading-[1.65] break-words">
                      <Highlighted text={snippet} query={debouncedQuery} />
                    </p>
                  </a>
                );
              })}
            </div>

            {results.length === MAX_RESULTS && (
              <p className="text-xs text-[#bbb] dark:text-[#444] text-center mt-6">
                Showing first {MAX_RESULTS} matches — refine your search to see more specific results.
              </p>
            )}
          </>
        )}
      </main>
    </>
  );
}
