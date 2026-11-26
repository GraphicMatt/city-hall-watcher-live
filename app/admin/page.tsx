'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import type { ActiveSession, ArchiveEntry } from '@/lib/kv';
import MetadataEditor from '@/components/MetadataEditor';
import AdminShell, { adminCard, adminCardLabel } from '@/components/AdminShell';
import AdminPastSessions from '@/components/AdminPastSessions';

// How many threads the dashboard shows before linking to /admin/threads.
const RECENT_THREAD_COUNT = 5;

export default function AdminPage() {
  return (
    <AdminShell>
      <AdminDashboard />
    </AdminShell>
  );
}

function AdminDashboard() {
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [archiveIndex, setArchiveIndex] = useState<ArchiveEntry[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [sessionError, setSessionError] = useState('');
  const [loading, setLoading] = useState(false);
  const [endError, setEndError] = useState('');
  const [sessionMetaExpanded, setSessionMetaExpanded] = useState(false);

  const isLive = session?.status === 'live';
  const isEnded = session?.status === 'ended';

  // Notification refs — track whether the admin manually ended coverage
  // so we can avoid firing a spurious notification when they click the button.
  const adminEndedRef = useRef(false);
  const notifPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    Promise.all([fetchSession(), fetchArchiveIndex()]);
  }, []);

  // When the session is live, request notification permission and start a
  // background poll that fires a browser notification if coverage ends without
  // the admin clicking "End coverage" themselves.
  useEffect(() => {
    if (!isLive) return;

    // Reset the flag whenever a live session is observed
    adminEndedRef.current = false;

    // Request permission (no-op if already granted/denied)
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }

    const NOTIF_POLL_MS = 2 * 60_000; // 2 minutes

    async function checkForUnexpectedEnd() {
      try {
        const r = await fetch('/api/session');
        if (!r.ok) return;
        const data = await r.json();
        if (data?.status === 'ended' && !adminEndedRef.current) {
          // Coverage ended without the admin clicking the button
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            const slug = data.archivedSlug && data.archivedSlug !== '__archiving__'
              ? data.archivedSlug
              : null;
            new Notification('CHW Live — Coverage ended', {
              body: slug
                ? `The session was automatically archived. View: /archive/${slug}`
                : 'The session ended automatically. Refresh the admin page for details.',
              icon: '/icon.png',
            });
          }
          // Refresh so the UI shows the ended state
          await Promise.all([fetchSession(), fetchArchiveIndex()]);
          if (notifPollRef.current) clearInterval(notifPollRef.current);
        }
      } catch {
        // Network hiccup — try again next interval
      }
    }

    notifPollRef.current = setInterval(checkForUnexpectedEnd, NOTIF_POLL_MS);
    return () => { if (notifPollRef.current) clearInterval(notifPollRef.current); };
  }, [isLive]);

  async function fetchSession() {
    const r = await fetch('/api/session');
    setSession(await r.json());
  }

  async function fetchArchiveIndex() {
    const r = await fetch('/api/archive');
    if (r.ok) setArchiveIndex(await r.json());
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
    adminEndedRef.current = true; // suppress the browser notification — we know it's ending
    setLoading(true);
    setEndError('');
    try {
      const r = await fetch('/api/session', { method: 'DELETE' });
      if (!r.ok) {
        const data = await r.json();
        setEndError(data.error || 'Archive failed — try again.');
      }
      await Promise.all([fetchSession(), fetchArchiveIndex()]);
    } catch {
      setEndError('Network error — try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Coverage: current session status plus the Go live / End coverage action */}
      <div className={`${adminCard} ${isLive ? 'border-[#2a7a3a]/40 dark:border-[#4caf6a]/40' : ''}`}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className={adminCardLabel}>Current session</p>
          {session && (
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
              isLive
                ? 'bg-[#e6f4ea] text-[#2a7a3a] dark:bg-[#1a3a22] dark:text-[#4caf6a]'
                : 'bg-[#f0f0ea] text-[#666] dark:bg-[#2a2a2a] dark:text-[#999]'
            }`}>
              {isLive && <span className="w-[7px] h-[7px] rounded-full bg-current animate-pulse" />}
              {isLive ? 'Live' : 'Ended'}
            </span>
          )}
        </div>

        {!session && (
          <p className="text-sm text-[#999] dark:text-[#555]">No active session.</p>
        )}

        {session && (
          <div className="flex flex-col gap-1.5">
            {isLive && session.metadata?.meetingTitle && (
              <p className="text-sm font-medium text-[#1a1a1a] dark:text-[#e8e8e0]">{session.metadata.meetingTitle}</p>
            )}
            <p className="text-xs text-[#888] dark:text-[#555] break-all">{session.rootUrl}</p>
            <p className="text-xs text-[#aaa] dark:text-[#444]">
              Started {new Date(session.startedAt).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
            {isEnded && session.archivedSlug && session.archivedSlug !== '__archiving__' && (
              <a
                href={`/${session.archivedSlug}`}
                className="text-xs text-[#1a6bbf] dark:text-[#5a9fd4] hover:underline"
              >
                View archive → /{session.archivedSlug}
              </a>
            )}
            {isEnded && session.archivedSlug === '__archiving__' && (
              <p className="text-xs text-[#888] dark:text-[#555]">Archive in progress…</p>
            )}
          </div>
        )}

        {/* End coverage */}
        {isLive && (
          <div className="mt-4 pt-4 border-t border-[#f0f0ea] dark:border-[#222]">
            <p className="text-xs text-[#888] dark:text-[#555] mb-3">
              Ending coverage snapshots the posts and saves them to the archive. This may take a few seconds.
            </p>
            {endError && (
              <p className="text-xs text-[#c0392b] dark:text-[#f08080] mb-3">⚠ {endError}</p>
            )}
            <button
              onClick={handleEndSession}
              disabled={loading}
              className="text-sm font-medium px-4 py-2 rounded-lg border border-[#e0e0d8] dark:border-[#2a2a2a] text-[#c0392b] dark:text-[#f08080] hover:bg-[#fdecea] dark:hover:bg-[#3a1a1a] transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving archive…' : 'End coverage'}
            </button>
          </div>
        )}

        {/* Go live */}
        {!isLive && (
          <form
            onSubmit={handleStartSession}
            className="mt-4 pt-4 border-t border-[#f0f0ea] dark:border-[#222] flex flex-col gap-3"
          >
            <label htmlFor="go-live-url" className={adminCardLabel}>Start coverage</label>
            <input
              id="go-live-url"
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
        )}

        {/* Meeting details for the current (or just-ended) session */}
        {session && (
          <div className="mt-4 pt-4 border-t border-[#f0f0ea] dark:border-[#222]">
            <button
              onClick={() => setSessionMetaExpanded(v => !v)}
              className="text-xs font-medium text-[#888] uppercase tracking-wide hover:text-[#333] dark:hover:text-[#ccc] transition-colors"
            >
              Meeting details {sessionMetaExpanded ? '▲' : '▼'}
            </button>
            {sessionMetaExpanded && (
              <div className="mt-3">
                <MetadataEditor
                  initialMetadata={session.metadata}
                  onSaved={updated => setSession(s => s ? { ...s, metadata: updated } : s)}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Recent threads */}
      {archiveIndex.length > 0 && (
        <AdminPastSessions
          entries={archiveIndex}
          limit={RECENT_THREAD_COUNT}
          onMetaSaved={(slug, updated) =>
            setArchiveIndex(idx => idx.map(e => e.slug === slug ? { ...e, metadata: updated } : e))
          }
          onDelete={slug => setArchiveIndex(idx => idx.filter(e => e.slug !== slug))}
        />
      )}

      <p className="text-xs text-[#aaa] dark:text-[#555] text-center">
        Special threads live under <Link href="/admin/threads" className="underline hover:text-[#333] dark:hover:text-[#ccc]">Threads</Link>;
        imports, slug renames and the quotes index under <Link href="/admin/tools" className="underline hover:text-[#333] dark:hover:text-[#ccc]">Import &amp; tools</Link>.
      </p>
    </>
  );
}
