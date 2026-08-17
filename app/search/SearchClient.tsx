'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { CorpusPost } from '@/lib/search';
import SiteHeader from '@/components/SiteHeader';

const MAX_RESULTS = 50;
const DEBOUNCE_MS = 200;
const MIN_QUERY_LEN = 2;

// ── Helpers ────────────────────────────────────────────────────────────────

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Split the raw query into individual lowercase terms, filtering out
// single-character tokens (too noisy). Each term must independently appear
// in the post for it to be considered a match (AND logic).
function parseTerms(raw: string): string[] {
  return raw.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
}

// Count total occurrences of all terms in a string — used for relevance scoring.
function countOccurrences(lower: string, terms: string[]): number {
  return terms.reduce((total, t) => {
    let count = 0, i = 0;
    while ((i = lower.indexOf(t, i)) !== -1) { count++; i++; }
    return total + count;
  }, 0);
}

// Count occurrences of each term as a *standalone word* (word-boundary match).
// Used to push posts like "...about cars near Bradford..." above posts that
// only happen to contain a term as a substring of a longer word, e.g.
// searching "car" shouldn't rank "...motion CARRIES..." above an actual
// mention of "car"/"cars".
function countWholeWordOccurrences(lower: string, terms: string[]): number {
  return terms.reduce((total, t) => {
    const re = new RegExp(`\\b${escapeRegex(t)}\\b`, 'g');
    const matches = lower.match(re);
    return total + (matches ? matches.length : 0);
  }, 0);
}

// Wrap every occurrence of any search term in the snippet with a <mark>.
// Each term is highlighted independently, so "Bradford cars" highlights both
// words wherever they appear rather than requiring them to be adjacent.
function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>;
  const pattern = terms.map(escapeRegex).join('|');
  const parts = text.split(new RegExp(`(${pattern})`, 'gi'));
  const lowerTerms = new Set(terms);
  return (
    <>
      {parts.map((part, i) =>
        lowerTerms.has(part.toLowerCase()) ? (
          <mark
            key={i}
            className="bg-archive-gold/20 rounded-[3px] px-0.5 not-italic"
            style={{ color: 'var(--text)' }}
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

// ── Component ─────────────────────────────────────────────────────────────

export default function SearchClient({ initialQuery = '' }: { initialQuery?: string }) {
  const [corpus, setCorpus] = useState<CorpusPost[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [imagesOnly, setImagesOnly] = useState(false);
  const [pastYearOnly, setPastYearOnly] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Rolling one-year cutoff, computed once per mount so "past year" always
  // means the last 12 months rather than a date that goes stale.
  const oneYearAgoIso = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString();
  }, []);

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

  // Parse the debounced query into individual terms once, so both the
  // matching and rendering passes use the exact same set of tokens.
  const terms = useMemo(() => parseTerms(debouncedQuery), [debouncedQuery]);

  // Run search: require ALL terms to appear (AND logic), then rank by total
  // term frequency (more occurrences = more relevant), break ties by recency.
  const results = useMemo<CorpusPost[] | null>(() => {
    if (!corpus || debouncedQuery.length < MIN_QUERY_LEN || terms.length === 0) return null;
    const matched = corpus.filter(p => {
      if (imagesOnly && !p.imageUrl) return false;
      if (pastYearOnly && p.indexedAt < oneYearAgoIso) return false;
      const lower = p.text.toLowerCase();
      return terms.every(t => lower.includes(t));
    });
    // Rank whole-word matches well above incidental substring matches (e.g.
    // "car" inside "CARRIES"), then by raw occurrence count, then by recency.
    matched.sort((a, b) => {
      const aLower = a.text.toLowerCase();
      const bLower = b.text.toLowerCase();
      const scoreA = countWholeWordOccurrences(aLower, terms) * 5 + countOccurrences(aLower, terms);
      const scoreB = countWholeWordOccurrences(bLower, terms) * 5 + countOccurrences(bLower, terms);
      const diff = scoreB - scoreA;
      return diff !== 0 ? diff : b.indexedAt.localeCompare(a.indexedAt);
    });
    return matched.slice(0, MAX_RESULTS);
  }, [corpus, debouncedQuery, terms, imagesOnly, pastYearOnly, oneYearAgoIso]);

  const sessionCount = useMemo(
    () => (corpus ? new Set(corpus.map(p => p.slug)).size : 0),
    [corpus],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <SiteHeader />

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
            className="w-full border border-border rounded-xl bg-card text-chw-text placeholder:text-chw-tertiary outline-none focus:border-chw-secondary transition-colors disabled:opacity-50"
            style={{ fontSize: '15px', padding: '0 40px 0 16px', height: '48px' }}
          />
          {query && (
            <button
              onClick={handleClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-chw-tertiary hover:text-chw-secondary text-lg leading-none"
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 mb-6 -mt-2">
          <label className="flex items-center gap-1.5 cursor-pointer select-none" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={imagesOnly}
              onChange={e => setImagesOnly(e.target.checked)}
              className="cursor-pointer accent-chw-secondary"
            />
            Has images
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer select-none" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={pastYearOnly}
              onChange={e => setPastYearOnly(e.target.checked)}
              className="cursor-pointer accent-chw-secondary"
            />
            Past year only
          </label>
        </div>

        {/* Loading / error */}
        {!corpus && !loadError && (
          <p className="text-sm text-chw-tertiary text-center py-12">
            Loading search index…
          </p>
        )}
        {loadError && (
          <p className="text-sm text-live-red text-center py-12">
            Could not load search index — try refreshing.
          </p>
        )}

        {/* Idle state */}
        {corpus && debouncedQuery.length < MIN_QUERY_LEN && (
          <p className="text-center py-8" style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
            {corpus.length.toLocaleString()} posts indexed across {sessionCount} sessions
          </p>
        )}

        {/* No results */}
        {results?.length === 0 && (
          <p className="text-sm text-chw-tertiary text-center py-12">
            No posts found for <span className="font-medium text-chw-secondary">&ldquo;{debouncedQuery}&rdquo;</span>
          </p>
        )}

        {/* Results */}
        {results && results.length > 0 && (
          <>
            <p className="mb-4" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {results.length === MAX_RESULTS
                ? `${MAX_RESULTS}+ results — try a more specific search`
                : `${results.length} ${results.length === 1 ? 'result' : 'results'}`}
            </p>
            <div className="flex flex-col gap-3">
              {results.map(post => (
                <div
                  key={`${post.slug}/${post.postId}`}
                  className="flex flex-col gap-1.5"
                  style={{
                    background: 'var(--card)',
                    borderRadius: '12px',
                    boxShadow: 'var(--card-shadow)',
                    padding: '14px 16px',
                  }}
                >
                  {/* Session context */}
                  <div className="flex items-baseline justify-between gap-3">
                    <span
                      className="truncate"
                      style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pale-blue-text)' }}
                    >
                      {post.sessionLabel}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', flexShrink: 0 }}>
                      {formatPostDate(post.indexedAt)}
                    </span>
                  </div>
                  {/* Full post text */}
                  <p style={{ fontSize: '15px', lineHeight: '1.6', color: 'var(--text)' }} className="whitespace-pre-wrap break-words">
                    <Highlighted text={post.text} terms={terms} />
                  </p>
                  {/* Image thumbnail, if the post has one */}
                  {post.imageUrl && (
                    <div className="flex items-center gap-2 mt-0.5">
                      <img
                        src={post.imageUrl}
                        alt=""
                        loading="lazy"
                        className="rounded-md border border-border object-cover"
                        style={{ width: '96px', height: '72px' }}
                      />
                      {post.imageCount && post.imageCount > 1 && (
                        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                          +{post.imageCount - 1} more
                        </span>
                      )}
                    </div>
                  )}
                  {/* Jump to post in context of full thread */}
                  <a
                    href={`/${post.slug}#post-${post.postId}`}
                    className="hover:underline self-start"
                    style={{ fontSize: '12px', color: 'var(--pale-blue-text)', marginTop: '2px' }}
                  >
                    View in thread →
                  </a>
                </div>
              ))}
            </div>

            {results.length === MAX_RESULTS && (
              <p className="text-center mt-6" style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                Showing first {MAX_RESULTS} matches — refine your search to see more specific results.
              </p>
            )}
          </>
        )}
      </main>
    </>
  );
}
