'use client';

import { useState, useMemo } from 'react';
import type { ArchiveEntry } from '@/lib/kv';

type SortOrder = 'newest' | 'oldest' | 'most-posts';

// Toronto council terms run on 4-year cycles from the election year.
function getTerm(year: number): string {
  if (year <= 2014) return '2010–2014';
  if (year <= 2018) return '2014–2018';
  if (year <= 2022) return '2018–2022';
  return '2022–2026';
}

function getYear(isoString: string): number {
  return parseInt(
    new Date(isoString).toLocaleDateString('en-CA', { year: 'numeric', timeZone: 'America/Toronto' }),
    10
  );
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Toronto',
  });
}

const SELECT_CLASS =
  'text-xs text-chw-secondary bg-white border border-border rounded-lg px-2.5 py-1.5 cursor-pointer hover:border-chw-secondary outline-none transition-colors';

interface Props {
  entries: ArchiveEntry[];
}

export default function ArchiveIndexClient({ entries }: Props) {
  const [sort, setSort] = useState<SortOrder>('newest');
  const [yearFilter, setYearFilter] = useState('');
  const [termFilter, setTermFilter] = useState('');

  // Derive available filter options
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

  // Years visible in the year dropdown (scoped to selected term)
  const visibleYears = useMemo(
    () => termFilter ? years.filter(y => getTerm(y) === termFilter) : years,
    [years, termFilter]
  );

  // Filtered + sorted entries
  const filtered = useMemo(() => {
    let result = [...entries];
    if (termFilter) result = result.filter(e => getTerm(getYear(e.startedAt)) === termFilter);
    if (yearFilter) result = result.filter(e => getYear(e.startedAt) === parseInt(yearFilter, 10));

    if (sort === 'newest') result.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    else if (sort === 'oldest') result.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    else result.sort((a, b) => b.postCount - a.postCount);

    return result;
  }, [entries, sort, yearFilter, termFilter]);

  // Group by year for date-sorted views; null = flat list
  const grouped = useMemo<Map<number, ArchiveEntry[]> | null>(() => {
    if (sort === 'most-posts') return null;
    const map = new Map<number, ArchiveEntry[]>();
    for (const e of filtered) {
      const y = getYear(e.startedAt);
      const bucket = map.get(y) ?? [];
      bucket.push(e);
      map.set(y, bucket);
    }
    return map;
  }, [filtered, sort]);

  function handleTermChange(value: string) {
    setTermFilter(value);
    setYearFilter(''); // reset year when term changes
  }

  const sortedGroupKeys = grouped
    ? Array.from(grouped.keys()).sort((a, b) => sort === 'oldest' ? a - b : b - a)
    : [];

  return (
    <div>
      {/* Controls */}
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {terms.length > 1 && (
            <select value={termFilter} onChange={e => handleTermChange(e.target.value)} className={SELECT_CLASS}>
              <option value="">All terms</option>
              {terms.map(t => (
                <option key={t} value={t}>{t} term</option>
              ))}
            </select>
          )}
          <select value={yearFilter} onChange={e => setYearFilter(e.target.value)} className={SELECT_CLASS}>
            <option value="">All years</option>
            {visibleYears.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <select value={sort} onChange={e => setSort(e.target.value as SortOrder)} className={SELECT_CLASS}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="most-posts">Most posts</option>
        </select>
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-chw-tertiary text-center py-12">
          No sessions match the selected filters.
        </p>
      )}

      {/* Year-grouped layout (newest / oldest sorts) */}
      {grouped && sortedGroupKeys.map(year => {
        const group = grouped.get(year)!;
        return (
          <div key={year} className="mb-8">
            <div className="flex items-center gap-3 mb-3">
              <h2
                className="uppercase flex-shrink-0"
                style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '1.44px', color: 'rgb(117, 115, 106)' }}
              >
                {year}
              </h2>
              <div className="flex-1 h-px bg-border" />
              <span
                className="flex-shrink-0"
                style={{ fontSize: '12px', color: 'rgb(117, 115, 106)' }}
              >
                {group.length} {group.length === 1 ? 'session' : 'sessions'}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {group.map(entry => <ArchiveCard key={entry.slug} entry={entry} />)}
            </div>
          </div>
        );
      })}

      {/* Flat ranked layout (most-posts sort) */}
      {!grouped && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map(entry => <ArchiveCard key={entry.slug} entry={entry} />)}
        </div>
      )}
    </div>
  );
}

function ArchiveCard({ entry }: { entry: ArchiveEntry }) {
  const title = entry.metadata?.meetingTitle || entry.label;
  const dateStr = formatDate(entry.startedAt);

  return (
    <a
      href={`/${entry.slug}`}
      className="flex flex-col gap-1 hover:opacity-90 transition-opacity group"
      style={{
        background: 'rgb(255, 255, 255)',
        borderRadius: '12px',
        boxShadow: 'rgba(20, 20, 15, 0.04) 0px 1px 2px 0px',
        padding: '14px 16px',
      }}
    >
      <p
        className="leading-snug"
        style={{ fontSize: '15px', fontWeight: 600, color: 'rgb(27, 26, 23)' }}
      >
        {title}
      </p>
      <p style={{ fontSize: '12px', color: 'rgb(154, 152, 142)' }}>{dateStr}</p>
      <p style={{ fontSize: '12px', color: 'rgb(117, 115, 106)', marginTop: '2px' }}>
        {entry.postCount} {entry.postCount === 1 ? 'post' : 'posts'}{' '}
        <span style={{ color: 'rgb(39, 68, 144)', fontSize: '15px' }}>→</span>
      </p>
    </a>
  );
}
