'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { VoteTaggerRow } from '@/app/api/admin/vote-tagger/route';

type AdminState = 'checking' | 'login' | 'admin';

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
  const [adminState, setAdminState] = useState<AdminState>('checking');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<VoteTaggerRow[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  useEffect(() => {
    fetch('/api/auth')
      .then(r => {
        if (r.ok) {
          setAdminState('admin');
          loadData();
        } else {
          setAdminState('login');
        }
      })
      .catch(() => setAdminState('login'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData() {
    setDataLoading(true);
    try {
      const r = await fetch('/api/admin/vote-tagger');
      if (r.ok) {
        const data = await r.json();
        setSessions(data.sessions ?? []);
      }
    } finally {
      setDataLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');
    setLoading(true);
    try {
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!r.ok) {
        setLoginError('Incorrect password.');
      } else {
        setPassword('');
        setAdminState('admin');
        await loadData();
      }
    } catch {
      setLoginError('Something went wrong — try again.');
    } finally {
      setLoading(false);
    }
  }

  if (adminState === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-chw-tertiary">Loading…</p>
      </div>
    );
  }

  if (adminState === 'login') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
        <div className="w-full max-w-sm bg-card border border-card-border rounded-xl p-8">
          <h1 className="text-sm font-semibold text-chw-text mb-1">CHW Live Admin</h1>
          <p className="text-xs text-chw-tertiary mb-6">Enter your password to continue.</p>
          <form onSubmit={handleLogin} className="flex flex-col gap-3">
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              className="text-sm px-3 py-2 border border-border rounded-lg bg-bg text-chw-text placeholder-chw-tertiary outline-none focus:border-chw-secondary transition-colors"
            />
            {loginError && <p className="text-xs text-vote-lost">{loginError}</p>}
            <button
              type="submit"
              disabled={loading}
              className="text-sm font-medium py-2 rounded-lg bg-chw-text text-bg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const scraped = sessions.filter(s => s.hasFile || s.hasDbVotes).length;
  const inDb = sessions.filter(s => s.hasDbVotes).length;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
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
