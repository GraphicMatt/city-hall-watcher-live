'use client';

import { useState, useMemo } from 'react';
import type { ArchiveEntry } from '@/lib/kv';
import type { SessionMetadata } from '@/lib/bluesky';
import MetadataEditor from './MetadataEditor';

type SortOrder = 'newest' | 'oldest' | 'most-posts';

function getTerm(year: number): string {
  if (year <= 2014) return '2010–2014';
  if (year <= 2018) return '2014–2018';
  if (year <= 2022) return '2018–2022';
  return '2022–2026';
}

function getYear(isoString: string): number {
  return parseInt(
    new Date(isoString).toLocaleDateString('en-CA', { year: 'numeric', timeZone: 'America/Toronto' }),
    10,
  );
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-CA', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Toronto',
  });
}

const SELECT_CLASS =
  'text-xs text-[#666] dark:text-[#888] bg-white dark:bg-[#1a1a1a] border border-[#e0e0d8] dark:border-[#2a2a2a] rounded-md px-2 py-1 cursor-pointer hover:border-[#bbb] dark:hover:border-[#444] outline-none transition-colors';

interface Props {
  entries: ArchiveEntry[];
  onMetaSaved: (slug: string, updated: SessionMetadata) => void;
  onDelete: (slug: string) => void;
}

export default function AdminPastSessions({ entries, onMetaSaved, onDelete }: Props) {
  const [sort, setSort] = useState<SortOrder>('newest');
  const [yearFilter, setYearFilter] = useState('');
  const [termFilter, setTermFilter] = useState('');
  const [expandedMeta, setExpandedMeta] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [patching, setPatching] = useState<string | null>(null);
  const [patchResult, setPatchResult] = useState<Map<string, string>>(new Map());

  const { years, terms } = useMemo(() => {
    const yearSet = new Set<number>();
    const termSet = new Set<string>();
    for (const e of entries) {
      const y = getYear(e.startedAt);
      yearSet.add(y);
      termSet.add(getTerm(y));
    }
    return {
      years: Array.from(yearSet).sort((a, b) => b - a),
      terms: Array.from(termSet).sort((a, b) => b.localeCompare(a)),
    };
  }, [entries]);

  const visibleYears = useMemo(
    () => termFilter ? years.filter(y => getTerm(y) === termFilter) : years,
    [years, termFilter],
  );

  const filtered = useMemo(() => {
    let result = [...entries];
    if (termFilter) result = result.filter(e => getTerm(getYear(e.startedAt)) === termFilter);
    if (yearFilter) result = result.filter(e => getYear(e.startedAt) === parseInt(yearFilter, 10));
    if (sort === 'newest') result.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    else if (sort === 'oldest') result.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    else result.sort((a, b) => b.postCount - a.postCount);
    return result;
  }, [entries, sort, yearFilter, termFilter]);

  const grouped = useMemo<Map<number, ArchiveEntry[]> | null>(() => {
    if (sort === 'most-posts') return null;
    const map = new Map<number, ArchiveEntry[]>();
    for (const e of filtered) {
      const y = getYear(e.startedAt);
      map.set(y, [...(map.get(y) ?? []), e]);
    }
    return map;
  }, [filtered, sort]);

  const sortedGroupKeys = grouped
    ? Array.from(grouped.keys()).sort((a, b) => sort === 'oldest' ? a - b : b - a)
    : [];

  function handleTermChange(value: string) {
    setTermFilter(value);
    setYearFilter('');
  }

  async function handlePatchQuotes(slug: string) {
    setPatching(slug);
    setPatchResult(prev => { const m = new Map(prev); m.delete(slug); return m; });
    try {
      const r = await fetch(`/api/archive/${slug}/patch-quotes`, { method: 'POST' });
      const data = await r.json();
      const msg = r.ok
        ? (data.patched > 0 ? `Added ${data.patched} quote-tweet card${data.patched !== 1 ? 's' : ''}` : 'No quote tweets found')
        : (data.error || 'Patch failed');
      setPatchResult(prev => new Map(prev).set(slug, msg));
    } catch {
      setPatchResult(prev => new Map(prev).set(slug, 'Network error — try again'));
    } finally {
      setPatching(null);
    }
  }

  async function handleDelete(slug: string) {
    setDeleting(slug);
    try {
      await fetch(`/api/archive/${slug}`, { method: 'DELETE' });
      onDelete(slug);
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  }

  const renderEntry = (entry: ArchiveEntry) => {
    const title = entry.metadata?.meetingTitle || entry.label;
    const isExpanded = expandedMeta === entry.slug;
    const isConfirming = confirmDelete === entry.slug;
    const isDeleting = deleting === entry.slug;
    const isPatching = patching === entry.slug;
    const patchMsg = patchResult.get(entry.slug);
    const isTwitterImport = entry.metadata?.importSource === 'twitter';

    return (
      <div key={entry.slug} className="py-2.5 border-b border-[#f0f0ea] dark:border-[#222] last:border-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <a
              href={`/${entry.slug}`}
              className="text-sm font-medium text-[#1a1a1a] dark:text-[#e8e8e0] hover:text-[#1a6bbf] dark:hover:text-[#5a9fd4] transition-colors leading-snug block"
            >
              {title}
            </a>
            <p className="text-xs text-[#aaa] dark:text-[#555] mt-0.5">
              {formatDate(entry.startedAt)}
              <span className="mx-1.5 text-[#ddd] dark:text-[#333]">·</span>
              {entry.postCount} {entry.postCount === 1 ? 'post' : 'posts'}
            </p>
            {isTwitterImport && (
              <p className="mt-1">
                {patchMsg ? (
                  <span className="text-xs text-[#aaa] dark:text-[#555]">{patchMsg}</span>
                ) : (
                  <button
                    onClick={() => handlePatchQuotes(entry.slug)}
                    disabled={isPatching}
                    className="text-xs text-[#aaa] dark:text-[#555] hover:text-[#1a6bbf] dark:hover:text-[#5a9fd4] underline disabled:opacity-50"
                  >
                    {isPatching ? 'Checking for quote tweets…' : 'Patch quote tweets'}
                  </button>
                )}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 flex-shrink-0 pt-0.5">
            <button
              onClick={() => setExpandedMeta(v => v === entry.slug ? null : entry.slug)}
              className="text-xs text-[#aaa] dark:text-[#555] hover:text-[#333] dark:hover:text-[#ccc] transition-colors"
            >
              {isExpanded ? 'Done' : 'Edit'}
            </button>
            {isConfirming ? (
              <>
                <button
                  onClick={() => handleDelete(entry.slug)}
                  disabled={isDeleting}
                  className="text-xs text-[#c0392b] dark:text-[#f08080] hover:underline disabled:opacity-50"
                >
                  {isDeleting ? 'Deleting…' : 'Confirm'}
                </button>
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="text-xs text-[#aaa] hover:text-[#555] dark:hover:text-[#ccc]"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmDelete(entry.slug)}
                className="text-xs text-[#ddd] dark:text-[#444] hover:text-[#c0392b] dark:hover:text-[#f08080] transition-colors"
              >
                Delete
              </button>
            )}
          </div>
        </div>

        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-[#f0f0ea] dark:border-[#222]">
            <MetadataEditor
              slug={entry.slug}
              initialMetadata={entry.metadata}
              onSaved={updated => {
                onMetaSaved(entry.slug, updated);
                setExpandedMeta(null);
              }}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-[#1a1a1a] border border-[#e0e0d8] dark:border-[#2a2a2a] rounded-xl p-5">
      {/* Header + controls */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <p className="text-xs font-medium text-[#888] uppercase tracking-wide">
          Past sessions
          <span className="ml-2 font-normal normal-case tracking-normal text-[#bbb] dark:text-[#444]">
            ({filtered.length}{filtered.length !== entries.length ? ` of ${entries.length}` : ''})
          </span>
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {terms.length > 1 && (
            <select value={termFilter} onChange={e => handleTermChange(e.target.value)} className={SELECT_CLASS}>
              <option value="">All terms</option>
              {terms.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          <select value={yearFilter} onChange={e => setYearFilter(e.target.value)} className={SELECT_CLASS}>
            <option value="">All years</option>
            {visibleYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={sort} onChange={e => setSort(e.target.value as SortOrder)} className={SELECT_CLASS}>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="most-posts">Most posts</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-[#999] dark:text-[#555] py-4 text-center">
          No sessions match the selected filters.
        </p>
      )}

      {/* Year-grouped layout */}
      {grouped && sortedGroupKeys.map(year => (
        <div key={year} className="mb-4 last:mb-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-semibold text-[#bbb] dark:text-[#444] uppercase tracking-wider">
              {year}
            </span>
            <div className="flex-1 h-px bg-[#f0f0ea] dark:bg-[#222]" />
          </div>
          {grouped.get(year)!.map(renderEntry)}
        </div>
      ))}

      {/* Flat layout for most-posts sort */}
      {!grouped && filtered.map(renderEntry)}
    </div>
  );
}
