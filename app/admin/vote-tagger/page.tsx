'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { VoteTaggerRow } from '@/app/api/admin/vote-tagger/route';
import AdminShell from '@/components/AdminShell';

function StatusBadge({ row }: { row: VoteTaggerRow }) {
  if (row.hasDbVotes) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-vote-yes-pill text-vote-carried">
        ✓ Votes in DB
      </span>
    );
  }
  if (row.hasFile) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-vote-absent text-chw-secondary">
        📁 File ready
      </span>
    );
  }
  if (row.fileEmpty) {
    return (
      <span
        title="The votes file has no votes — usually scraped before the Minutes were published. Re-run the scraper."
        className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border border-vote-lost text-vote-lost">
        Empty file — re-scrape
      </span>
    );
  }
  if (row.meetingCode) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border border-border text-chw-tertiary">
        Not scraped
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border border-border text-chw-tertiary">
      No meeting data
    </span>
  );
}

export default function VoteTaggerPage() {
  return (
    <AdminShell width="wide">
      <VoteTagger />
    </AdminShell>
  );
}

function VoteTagger() {
  const [sessions, setSessions] = useState<VoteTaggerRow[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/vote-tagger')
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (data) setSessions(data.sessions ?? []); })
      .finally(() => setDataLoading(false));
  }, []);

  const scraped = sessions.filter(s => s.hasFile || s.hasDbVotes).length;
  const inDb = sessions.filter(s => s.hasDbVotes).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-semibold text-chw-text">Vote tagger</h1>
        <Link href="/admin/vote-tagger/add"
          className="text-sm font-medium px-3 py-1.5 rounded-lg border border-border hover:border-chw-secondary transition-colors text-chw-text">
          + Manual attach
        </Link>
      </div>
      <p className="text-sm text-chw-secondary mb-2">
        {sessions.length} sessions · {scraped} scraped · {inDb} with votes in DB
      </p>
      <p className="text-xs text-chw-tertiary mb-6">
        Run <code className="font-mono">python3 scripts/scrape-all-votes.py</code> to populate{' '}
        <code className="font-mono">data/votes/</code>, then commit the files.
        Sessions with a local file load votes automatically — no copy-paste needed.
        Empty files are re-scraped automatically on the next run.
      </p>

      {dataLoading ? (
        <p className="text-sm text-chw-tertiary">Loading…</p>
      ) : (
        <div className="flex flex-col divide-y divide-border border border-border rounded-lg overflow-hidden">
          {sessions.map(row => (
            <div key={row.slug} className="flex items-center gap-3 px-4 py-3 bg-card hover:bg-bg-secondary transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-chw-text">{row.label}</span>
                  {row.meetingCode && (
                    <span className="text-[11px] font-mono text-chw-tertiary bg-bg border border-border rounded px-1.5 py-0.5">
                      {row.meetingCode}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-chw-tertiary mt-0.5">
                  {row.postCount} posts
                  {row.minutesUrl && (
                    <>
                      {' · '}
                      <a
                        href={row.minutesUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        minutes ↗
                      </a>
                    </>
                  )}
                </div>
              </div>
              <StatusBadge row={row} />
              <Link
                href={`/admin/${row.slug}/votes`}
                className="text-[12px] font-medium text-chw-text border border-border rounded px-3 py-1.5 hover:border-chw-secondary transition-colors whitespace-nowrap"
              >
                Tag votes →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
