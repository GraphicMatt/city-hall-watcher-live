'use client';

import { useState, useEffect } from 'react';
import type { ActiveSession, ArchiveEntry } from '@/lib/kv';

type AdminState = 'checking' | 'login' | 'admin';

export default function AdminPage() {
  const [adminState, setAdminState] = useState<AdminState>('checking');
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [archiveIndex, setArchiveIndex] = useState<ArchiveEntry[]>([]);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [sessionError, setSessionError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/auth')
      .then(r => {
        if (r.ok) {
          setAdminState('admin');
          return Promise.all([fetchSession(), fetchArchiveIndex()]);
        } else {
          setAdminState('login');
        }
      })
      .catch(() => setAdminState('login'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchSession() {
    const r = await fetch('/api/session');
    setSession(await r.json());
  }

  async function fetchArchiveIndex() {
    const r = await fetch('/api/archive');
    if (r.ok) setArchiveIndex(await r.json());
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
        await Promise.all([fetchSession(), fetchArchiveIndex()]);
      }
    } catch {
      setLoginError('Something went wrong — try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleStartSession(e: React.FormEvent) {
    e.preventDefault();
    setSessionError('');
    setLoading(true);
    try {
      const r = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootUrl: urlInput }),
      });
      const data = await r.json();
      if (!r.ok) {
        setSessionError(data.error || 'Could not start session.');
      } else {
        setUrlInput('');
        await fetchSession();
      }
    } catch {
      setSessionError('Something went wrong — try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleEndSession() {
    setLoading(true);
    try {
      await fetch('/api/session', { method: 'DELETE' });
      await Promise.all([fetchSession(), fetchArchiveIndex()]);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await fetch('/api/auth', { method: 'DELETE' });
    setAdminState('login');
    setSession(null);
    setArchiveIndex([]);
  }

  if (adminState === 'checking') {
    return (
      <div className="min-h-screen bg-[#f5f5f0] dark:bg-[#111] flex items-center justify-center">
        <p className="text-sm text-[#999] dark:text-[#555]">Loading…</p>
      </div>
    );
  }

  if (adminState === 'login') {
    return (
      <div className="min-h-screen bg-[#f5f5f0] dark:bg-[#111] flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white dark:bg-[#1a1a1a] border border-[#e0e0d8] dark:border-[#2a2a2a] rounded-xl p-8">
          <h1 className="text-sm font-semibold text-[#1a1a1a] dark:text-[#e8e8e0] mb-1">CHW Live Admin</h1>
          <p className="text-xs text-[#888] mb-6">Enter your password to continue.</p>
          <form onSubmit={handleLogin} className="flex flex-col gap-3">
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              className="text-sm px-3 py-2 border border-[#d0d0c8] dark:border-[#333] rounded-lg bg-[#fafaf8] dark:bg-[#111] text-[#1a1a1a] dark:text-[#e8e8e0] placeholder-[#aaa] outline-none focus:border-[#888] dark:focus:border-[#666] transition-colors"
            />
            {loginError && <p className="text-xs text-[#c0392b] dark:text-[#f08080]">{loginError}</p>}
            <button
              type="submit"
              disabled={loading}
              className="text-sm font-medium py-2 rounded-lg bg-[#1a1a1a] dark:bg-[#e8e8e0] text-white dark:text-[#111] hover:bg-[#333] dark:hover:bg-white transition-colors disabled:opacity-50"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const isLive = session?.status === 'live';
  const isEnded = session?.status === 'ended';

  return (
    <div className="min-h-screen bg-[#f5f5f0] dark:bg-[#111]">
      <header className="bg-white dark:bg-[#1a1a1a] border-b border-[#e0e0d8] dark:border-[#2a2a2a] px-6 py-3.5 flex items-center justify-between sticky top-0 z-10">
        <h1 className="text-sm font-semibold text-[#1a1a1a] dark:text-[#e8e8e0]">
          CHW Live <span className="text-[#888] font-normal">/ Admin</span>
        </h1>
        <div className="flex items-center gap-4">
          <a href="/" className="text-xs text-[#888] hover:text-[#333] dark:hover:text-[#ccc] underline">
            Public view →
          </a>
          <button
            onClick={handleLogout}
            className="text-xs text-[#888] hover:text-[#333] dark:hover:text-[#ccc] underline bg-none border-none cursor-pointer p-0"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-[560px] mx-auto px-4 py-8 flex flex-col gap-5">

        {/* Session status */}
        <div className="bg-white dark:bg-[#1a1a1a] border border-[#e0e0d8] dark:border-[#2a2a2a] rounded-xl p-5">
          <p className="text-xs font-medium text-[#888] uppercase tracking-wide mb-3">Current session</p>
          {!session && (
            <p className="text-sm text-[#999] dark:text-[#555]">No active session.</p>
          )}
          {session && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                  isLive
                    ? 'bg-[#e6f4ea] text-[#2a7a3a] dark:bg-[#1a3a22] dark:text-[#4caf6a]'
                    : 'bg-[#f0f0ea] text-[#666] dark:bg-[#2a2a2a] dark:text-[#999]'
                }`}>
                  {isLive && <span className="w-[7px] h-[7px] rounded-full bg-current animate-pulse" />}
                  {isLive ? 'Live' : 'Ended'}
                </span>
              </div>
              <p className="text-xs text-[#888] dark:text-[#555] break-all">{session.rootUrl}</p>
              <p className="text-xs text-[#aaa] dark:text-[#444]">
                Started {new Date(session.startedAt).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
              {isEnded && session.archivedSlug && (
                <a
                  href={`/${session.archivedSlug}`}
                  className="text-xs text-[#1a6bbf] dark:text-[#5a9fd4] hover:underline mt-1"
                >
                  View archive → /{session.archivedSlug}
                </a>
              )}
            </div>
          )}
        </div>

        {/* Start coverage */}
        {(!session || isEnded) && (
          <div className="bg-white dark:bg-[#1a1a1a] border border-[#e0e0d8] dark:border-[#2a2a2a] rounded-xl p-5">
            <p className="text-xs font-medium text-[#888] uppercase tracking-wide mb-3">Start coverage</p>
            <form onSubmit={handleStartSession} className="flex flex-col gap-3">
              <input
                type="text"
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                placeholder="https://bsky.app/profile/graphicmatt.com/post/..."
                className="text-sm px-3 py-2 border border-[#d0d0c8] dark:border-[#333] rounded-lg bg-[#fafaf8] dark:bg-[#111] text-[#1a1a1a] dark:text-[#e8e8e0] placeholder-[#aaa] outline-none focus:border-[#888] dark:focus:border-[#666] transition-colors"
              />
              {sessionError && <p className="text-xs text-[#c0392b] dark:text-[#f08080]">{sessionError}</p>}
              <button
                type="submit"
                disabled={loading || !urlInput.trim()}
                className="text-sm font-medium py-2 rounded-lg bg-[#1a1a1a] dark:bg-[#e8e8e0] text-white dark:text-[#111] hover:bg-[#333] dark:hover:bg-white transition-colors disabled:opacity-50"
              >
                {loading ? 'Starting…' : 'Go live'}
              </button>
            </form>
          </div>
        )}

        {/* End coverage */}
        {isLive && (
          <div className="bg-white dark:bg-[#1a1a1a] border border-[#e0e0d8] dark:border-[#2a2a2a] rounded-xl p-5">
            <p className="text-xs font-medium text-[#888] uppercase tracking-wide mb-3">End coverage</p>
            <p className="text-xs text-[#888] dark:text-[#555] mb-4">
              Posts will be snapshotted and saved to the archive. This may take a few seconds.
            </p>
            <button
              onClick={handleEndSession}
              disabled={loading}
              className="text-sm font-medium px-4 py-2 rounded-lg border border-[#e0e0d8] dark:border-[#2a2a2a] text-[#c0392b] dark:text-[#f08080] hover:bg-[#fdecea] dark:hover:bg-[#3a1a1a] transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving archive…' : 'End coverage'}
            </button>
          </div>
        )}

        {/* Past sessions */}
        {archiveIndex.length > 0 && (
          <div className="bg-white dark:bg-[#1a1a1a] border border-[#e0e0d8] dark:border-[#2a2a2a] rounded-xl p-5">
            <p className="text-xs font-medium text-[#888] uppercase tracking-wide mb-3">Past sessions</p>
            <div className="flex flex-col gap-2">
              {archiveIndex.map(entry => (
                <div key={entry.slug} className="flex items-center justify-between gap-4">
                  <div>
                    <a
                      href={`/${entry.slug}`}
                      className="text-sm text-[#1a6bbf] dark:text-[#5a9fd4] hover:underline"
                    >
                      {entry.label}
                    </a>
                    <span className="text-xs text-[#aaa] dark:text-[#555] ml-2">
                      {entry.postCount} posts
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
