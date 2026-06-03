'use client';

import { useState, useEffect, useRef } from 'react';
import type { ActiveSession, ArchiveEntry } from '@/lib/kv';
import type { SessionMetadata } from '@/lib/bluesky';
import MetadataEditor from '@/components/MetadataEditor';

interface CandidateThread {
  rootUri: string;
  rootUrl: string;
  meetingKey: string;
  meetingLabel: string;
  date: string;
  previewText: string;
  alreadyArchived: boolean;
  replyCount: number;
}

interface TweetPreview {
  id_str: string;
  full_text: string;
  created_at: string;
}

interface ProposedThread {
  rootTweetId: string;
  rootText: string;
  rootDate: string;
  tweetCount: number;
  tweets: TweetPreview[];
}

interface ProposedMeeting {
  meetingKey: string;
  meetingLabel: string;
  dates: string[];
  alreadyArchived: boolean;
  threads: ProposedThread[];
}

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
  const [endError, setEndError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [expandedMeta, setExpandedMeta] = useState<string | null>(null); // slug or 'session'

  // Bluesky history import state
  const today = new Date().toISOString().substring(0, 10);
  const [bskyOpen, setBskyOpen] = useState(false);
  const [bskySince, setBskySince] = useState('2023-01-01');
  const [bskyUntil, setBskyUntil] = useState(today);
  const [bskyDetecting, setBskyDetecting] = useState(false);
  const [bskyCandidates, setBskyCandidates] = useState<CandidateThread[]>([]);
  const [bskyTruncated, setBskyTruncated] = useState(false);
  const [bskyImporting, setBskyImporting] = useState<Set<string>>(new Set());
  const [bskyImported, setBskyImported] = useState<Map<string, string>>(new Map());
  const [bskyError, setBskyError] = useState<string | null>(null);

  // Twitter archive import state
  const [twitterOpen, setTwitterOpen] = useState(false);
  const [twitterTerm, setTwitterTerm] = useState('');
  const [twitterAnalyzing, setTwitterAnalyzing] = useState(false);
  const [twitterProposals, setTwitterProposals] = useState<ProposedMeeting[]>([]);
  const [twitterConfirming, setTwitterConfirming] = useState<Set<string>>(new Set());
  const [twitterImported, setTwitterImported] = useState<Map<string, string>>(new Map());
  const [twitterError, setTwitterError] = useState<string | null>(null);
  const [expandedTwitterMeeting, setExpandedTwitterMeeting] = useState<string | null>(null);
  const [expandedTwitterThread, setExpandedTwitterThread] = useState<string | null>(null);
  // key: `meetingKey::threadRootId` → Set of selected tweet id_strs (all selected by default)
  const [selectedTweets, setSelectedTweets] = useState<Map<string, Set<string>>>(new Map());

  // Derived booleans — declared early so they can be used in effects below
  const isLive = session?.status === 'live';
  const isEnded = session?.status === 'ended';

  // Notification refs — track whether the admin manually ended coverage
  // so we can avoid firing a spurious notification when they click the button.
  const adminEndedRef = useRef(false);
  const notifPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // When the session is live, request notification permission and start a
  // background poll that fires a browser notification if coverage ends without
  // the admin clicking "End coverage" themselves.
  useEffect(() => {
    if (adminState !== 'admin' || !isLive) return;

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminState, isLive]);

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

  async function handleDeleteArchive(slug: string) {
    setDeleting(slug);
    try {
      await fetch(`/api/archive/${slug}`, { method: 'DELETE' });
      await fetchArchiveIndex();
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  }

  async function handleBskyDetect() {
    setBskyDetecting(true);
    setBskyError(null);
    setBskyCandidates([]);
    try {
      const r = await fetch('/api/archive/import/bluesky/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ since: bskySince, until: bskyUntil }),
      });
      const data = await r.json();
      if (!r.ok) { setBskyError(data.error || 'Detection failed.'); return; }
      setBskyCandidates(data.candidates ?? []);
      setBskyTruncated(!!data.truncated);
    } catch {
      setBskyError('Network error — try again.');
    } finally {
      setBskyDetecting(false);
    }
  }

  async function handleBskyImport(candidate: CandidateThread) {
    setBskyImporting(prev => new Set(prev).add(candidate.rootUri));
    try {
      const r = await fetch('/api/archive/import/bluesky/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootUrl: candidate.rootUrl, meetingKey: candidate.meetingKey }),
      });
      const data = await r.json();
      if (r.ok && data.slug) {
        setBskyImported(prev => new Map(prev).set(candidate.rootUri, data.slug));
        await fetchArchiveIndex();
      } else {
        setBskyError(data.error || 'Import failed.');
      }
    } catch {
      setBskyError('Network error — try again.');
    } finally {
      setBskyImporting(prev => { const s = new Set(prev); s.delete(candidate.rootUri); return s; });
    }
  }

  async function handleTwitterAnalyze() {
    setTwitterAnalyzing(true);
    setTwitterError(null);
    setTwitterProposals([]);
    try {
      const body: Record<string, string> = {};
      if (twitterTerm) body.term = twitterTerm;
      const r = await fetch('/api/archive/import/twitter/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) { setTwitterError(data.error || 'Analysis failed.'); return; }
      setTwitterProposals(data.proposals ?? []);
    } catch {
      setTwitterError('Network error — try again.');
    } finally {
      setTwitterAnalyzing(false);
    }
  }

  function initTweetSelection(key: string, tweets: TweetPreview[]) {
    setSelectedTweets(prev => {
      if (prev.has(key)) return prev;
      const next = new Map(prev);
      next.set(key, new Set(tweets.map(t => t.id_str)));
      return next;
    });
  }

  function toggleTweet(key: string, id_str: string) {
    setSelectedTweets(prev => {
      const next = new Map(prev);
      const set = new Set(prev.get(key) ?? []);
      if (set.has(id_str)) { set.delete(id_str); } else { set.add(id_str); }
      next.set(key, set);
      return next;
    });
  }

  async function handleTwitterConfirm(meeting: ProposedMeeting, thread: ProposedThread) {
    const key = `${meeting.meetingKey}::${thread.rootTweetId}`;
    const selected = selectedTweets.get(key);
    const tweetsToImport = selected
      ? thread.tweets.filter(t => selected.has(t.id_str))
      : thread.tweets;
    if (tweetsToImport.length === 0) {
      setTwitterError('Select at least one tweet to import.');
      return;
    }
    setTwitterConfirming(prev => new Set(prev).add(key));
    try {
      const r = await fetch('/api/archive/import/twitter/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingKey: meeting.meetingKey, tweets: tweetsToImport }),
      });
      const data = await r.json();
      if (r.ok && data.slug) {
        setTwitterImported(prev => new Map(prev).set(key, data.slug));
        await fetchArchiveIndex();
      } else {
        setTwitterError(data.error || 'Import failed.');
      }
    } catch {
      setTwitterError('Network error — try again.');
    } finally {
      setTwitterConfirming(prev => { const s = new Set(prev); s.delete(key); return s; });
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
              {isEnded && session.archivedSlug && session.archivedSlug !== '__archiving__' && (
                <a
                  href={`/${session.archivedSlug}`}
                  className="text-xs text-[#1a6bbf] dark:text-[#5a9fd4] hover:underline mt-1"
                >
                  View archive → /{session.archivedSlug}
                </a>
              )}
              {isEnded && session.archivedSlug === '__archiving__' && (
                <p className="text-xs text-[#888] dark:text-[#555] mt-1">Archive in progress…</p>
              )}
            </div>
          )}
          {session && (
            <div className="mt-4 pt-4 border-t border-[#f0f0ea] dark:border-[#222]">
              <button
                onClick={() => setExpandedMeta(v => v === 'session' ? null : 'session')}
                className="text-xs font-medium text-[#888] uppercase tracking-wide hover:text-[#333] dark:hover:text-[#ccc] transition-colors"
              >
                Meeting details {expandedMeta === 'session' ? '▲' : '▼'}
              </button>
              {expandedMeta === 'session' && (
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
            {endError && (
              <p className="text-xs text-[#c0392b] dark:text-[#f08080] mb-3">
                ⚠ {endError}
              </p>
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

        {/* Past sessions */}
        {archiveIndex.length > 0 && (
          <div className="bg-white dark:bg-[#1a1a1a] border border-[#e0e0d8] dark:border-[#2a2a2a] rounded-xl p-5">
            <p className="text-xs font-medium text-[#888] uppercase tracking-wide mb-3">Past sessions</p>
            <div className="flex flex-col gap-2">
              {archiveIndex.map(entry => (
                <div key={entry.slug}>
                  <div className="flex items-center justify-between gap-4">
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
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <button
                        onClick={() => setExpandedMeta(v => v === entry.slug ? null : entry.slug)}
                        className="text-xs text-[#aaa] dark:text-[#555] hover:text-[#333] dark:hover:text-[#ccc] transition-colors"
                      >
                        {expandedMeta === entry.slug ? 'Done' : 'Edit'}
                      </button>
                      {confirmDelete === entry.slug ? (
                        <>
                          <button
                            onClick={() => handleDeleteArchive(entry.slug)}
                            disabled={deleting === entry.slug}
                            className="text-xs text-[#c0392b] dark:text-[#f08080] hover:underline disabled:opacity-50"
                          >
                            {deleting === entry.slug ? 'Deleting…' : 'Confirm delete'}
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
                          className="text-xs text-[#ccc] dark:text-[#444] hover:text-[#c0392b] dark:hover:text-[#f08080] transition-colors"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                  {expandedMeta === entry.slug && (
                    <div className="mt-3 pt-3 border-t border-[#f0f0ea] dark:border-[#222]">
                      <MetadataEditor
                        slug={entry.slug}
                        initialMetadata={entry.metadata}
                        onSaved={updated => {
                          setArchiveIndex(idx => idx.map(e => e.slug === entry.slug ? { ...e, metadata: updated } : e));
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Import Bluesky History */}
        <div className="bg-white dark:bg-[#1a1a1a] border border-[#e0e0d8] dark:border-[#2a2a2a] rounded-xl p-5">
          <button
            onClick={() => setBskyOpen(v => !v)}
            className="w-full text-left flex items-center justify-between"
          >
            <p className="text-xs font-medium text-[#888] uppercase tracking-wide">Import Bluesky History</p>
            <span className="text-xs text-[#aaa]">{bskyOpen ? '▲' : '▼'}</span>
          </button>
          {bskyOpen && (
            <div className="mt-4 flex flex-col gap-3">
              <p className="text-xs text-[#888] dark:text-[#555]">
                Detects Bluesky threads that fall on City Council meeting dates and imports them directly to the archive.
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-xs text-[#888]">From</label>
                <input
                  type="date"
                  value={bskySince}
                  onChange={e => setBskySince(e.target.value)}
                  className="text-xs px-2 py-1 border border-[#d0d0c8] dark:border-[#333] rounded bg-[#fafaf8] dark:bg-[#111] text-[#1a1a1a] dark:text-[#e8e8e0] outline-none focus:border-[#888]"
                />
                <label className="text-xs text-[#888]">To</label>
                <input
                  type="date"
                  value={bskyUntil}
                  onChange={e => setBskyUntil(e.target.value)}
                  className="text-xs px-2 py-1 border border-[#d0d0c8] dark:border-[#333] rounded bg-[#fafaf8] dark:bg-[#111] text-[#1a1a1a] dark:text-[#e8e8e0] outline-none focus:border-[#888]"
                />
                <button
                  onClick={handleBskyDetect}
                  disabled={bskyDetecting}
                  className="text-xs font-medium px-3 py-1 rounded-lg bg-[#1a1a1a] dark:bg-[#e8e8e0] text-white dark:text-[#111] hover:bg-[#333] disabled:opacity-50"
                >
                  {bskyDetecting ? 'Detecting…' : 'Detect threads'}
                </button>
              </div>
              {bskyError && <p className="text-xs text-[#c0392b] dark:text-[#f08080]">⚠ {bskyError}</p>}
              {bskyTruncated && (
                <p className="text-xs text-[#888]">Results truncated — narrow the date range to see earlier threads.</p>
              )}
              {bskyCandidates.length === 0 && !bskyDetecting && !bskyError && (
                <p className="text-xs text-[#aaa] dark:text-[#555]">No candidates yet — click Detect threads.</p>
              )}
              {bskyCandidates.length > 0 && (
                <div className="flex flex-col gap-2 mt-1">
                  {bskyCandidates.map(c => {
                    const importedSlug = bskyImported.get(c.rootUri);
                    const isImporting = bskyImporting.has(c.rootUri);
                    return (
                      <div key={c.rootUri} className="border border-[#f0f0ea] dark:border-[#222] rounded-lg p-3 flex flex-col gap-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-[#1a1a1a] dark:text-[#e8e8e0]">{c.meetingLabel}</p>
                            <p className="text-xs text-[#aaa] dark:text-[#555]">
                              {c.date}
                              {c.replyCount > 0 && (
                                <span className="ml-2 text-[#bbb] dark:text-[#444]">↩ {c.replyCount}</span>
                              )}
                            </p>
                            <p className="text-xs text-[#666] dark:text-[#888] mt-1 break-words">{c.previewText}&hellip;</p>
                          </div>
                          <div className="flex-shrink-0">
                            {importedSlug ? (
                              <a href={`/${importedSlug}`} className="text-xs text-[#1a6bbf] dark:text-[#5a9fd4] hover:underline">
                                Imported →
                              </a>
                            ) : c.alreadyArchived ? (
                              <span className="text-xs text-[#aaa] dark:text-[#555]">Already archived</span>
                            ) : (
                              <button
                                onClick={() => handleBskyImport(c)}
                                disabled={isImporting}
                                className="text-xs font-medium px-2.5 py-1 rounded bg-[#1a1a1a] dark:bg-[#e8e8e0] text-white dark:text-[#111] hover:bg-[#333] disabled:opacity-50"
                              >
                                {isImporting ? 'Importing…' : 'Import'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Import Twitter Archive */}
        <div className="bg-white dark:bg-[#1a1a1a] border border-[#e0e0d8] dark:border-[#2a2a2a] rounded-xl p-5">
          <button
            onClick={() => setTwitterOpen(v => !v)}
            className="w-full text-left flex items-center justify-between"
          >
            <p className="text-xs font-medium text-[#888] uppercase tracking-wide">Import Twitter Archive</p>
            <span className="text-xs text-[#aaa]">{twitterOpen ? '▲' : '▼'}</span>
          </button>
          {twitterOpen && (
            <div className="mt-4 flex flex-col gap-3">
              <p className="text-xs text-[#888] dark:text-[#555]">
                Analyzes the preprocessed Twitter archive and matches tweets to City Council meeting dates.
                Run <code className="bg-[#f5f5f0] dark:bg-[#222] px-1 rounded">scripts/preprocess-tweets.ts</code> first if you haven&apos;t already.
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={twitterTerm}
                  onChange={e => setTwitterTerm(e.target.value)}
                  className="text-xs px-2 py-1 border border-[#d0d0c8] dark:border-[#333] rounded bg-[#fafaf8] dark:bg-[#111] text-[#1a1a1a] dark:text-[#e8e8e0] outline-none focus:border-[#888]"
                >
                  <option value="">All terms</option>
                  <option value="2010-2014">2010–2014</option>
                  <option value="2014-2018">2014–2018</option>
                  <option value="2018-2022">2018–2022</option>
                  <option value="2022-2026">2022–2026</option>
                </select>
                <button
                  onClick={handleTwitterAnalyze}
                  disabled={twitterAnalyzing}
                  className="text-xs font-medium px-3 py-1 rounded-lg bg-[#1a1a1a] dark:bg-[#e8e8e0] text-white dark:text-[#111] hover:bg-[#333] disabled:opacity-50"
                >
                  {twitterAnalyzing ? 'Analyzing…' : 'Analyze archive'}
                </button>
              </div>
              {twitterError && <p className="text-xs text-[#c0392b] dark:text-[#f08080]">⚠ {twitterError}</p>}
              {twitterProposals.length === 0 && !twitterAnalyzing && !twitterError && (
                <p className="text-xs text-[#aaa] dark:text-[#555]">No proposals yet — click Analyze archive.</p>
              )}
              {twitterProposals.length > 0 && (
                <p className="text-xs text-[#888]">{twitterProposals.length} meetings found.</p>
              )}
              {twitterProposals.map(meeting => {
                const isExpanded = expandedTwitterMeeting === meeting.meetingKey;
                const allImported = meeting.threads.every(t =>
                  twitterImported.has(`${meeting.meetingKey}::${t.rootTweetId}`)
                );
                return (
                  <div key={meeting.meetingKey} className="border border-[#f0f0ea] dark:border-[#222] rounded-lg overflow-hidden">
                    <button
                      onClick={() => setExpandedTwitterMeeting(v => v === meeting.meetingKey ? null : meeting.meetingKey)}
                      className="w-full text-left px-3 py-2.5 flex items-center justify-between hover:bg-[#fafaf8] dark:hover:bg-[#111] transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-medium text-[#1a1a1a] dark:text-[#e8e8e0] truncate">{meeting.meetingLabel}</span>
                        <span className="text-xs text-[#aaa] dark:text-[#555] flex-shrink-0">
                          {meeting.threads.reduce((s, t) => s + t.tweetCount, 0)} tweets
                        </span>
                        {(meeting.alreadyArchived || allImported) && (
                          <span className="text-xs text-[#aaa] dark:text-[#555] flex-shrink-0">✓ archived</span>
                        )}
                      </div>
                      <span className="text-xs text-[#aaa] ml-2">{isExpanded ? '▲' : '▼'}</span>
                    </button>
                    {isExpanded && (
                      <div className="px-3 pb-3 flex flex-col gap-2 border-t border-[#f0f0ea] dark:border-[#222]">
                        {meeting.threads.map(thread => {
                          const key = `${meeting.meetingKey}::${thread.rootTweetId}`;
                          const importedSlug = twitterImported.get(key);
                          const isConfirming = twitterConfirming.has(key);
                          const isThreadExpanded = expandedTwitterThread === key;
                          const selected = selectedTweets.get(key);
                          const selectedCount = selected ? selected.size : thread.tweetCount;
                          return (
                            <div key={thread.rootTweetId} className="pt-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <button
                                    onClick={() => {
                                      if (!isThreadExpanded) initTweetSelection(key, thread.tweets);
                                      setExpandedTwitterThread(v => v === key ? null : key);
                                    }}
                                    className="text-left w-full"
                                  >
                                    <p className="text-xs text-[#666] dark:text-[#888] break-words">{thread.rootText}&hellip;</p>
                                    <p className="text-xs text-[#aaa] dark:text-[#555] mt-0.5">
                                      {isThreadExpanded
                                        ? `${selectedCount} of ${thread.tweetCount} selected`
                                        : `${thread.tweetCount} tweet${thread.tweetCount !== 1 ? 's' : ''}`
                                      } · {new Date(thread.rootDate).toLocaleDateString('en-CA')} {isThreadExpanded ? '▲' : '▼'}
                                    </p>
                                  </button>
                                </div>
                                <div className="flex-shrink-0">
                                  {importedSlug ? (
                                    <a href={`/${importedSlug}`} className="text-xs text-[#1a6bbf] dark:text-[#5a9fd4] hover:underline">
                                      Imported →
                                    </a>
                                  ) : (
                                    <button
                                      onClick={() => handleTwitterConfirm(meeting, thread)}
                                      disabled={isConfirming || selectedCount === 0}
                                      className="text-xs font-medium px-2.5 py-1 rounded bg-[#1a1a1a] dark:bg-[#e8e8e0] text-white dark:text-[#111] hover:bg-[#333] disabled:opacity-50"
                                    >
                                      {isConfirming ? 'Importing…' : selectedCount < thread.tweetCount ? `Import (${selectedCount})` : 'Import'}
                                    </button>
                                  )}
                                </div>
                              </div>
                              {isThreadExpanded && (
                                <div className="mt-2 flex flex-col gap-0.5 max-h-64 overflow-y-auto border border-[#f0f0ea] dark:border-[#222] rounded p-2">
                                  <div className="flex gap-2 mb-1">
                                    <button
                                      onClick={() => setSelectedTweets(prev => { const n = new Map(prev); n.set(key, new Set(thread.tweets.map(t => t.id_str))); return n; })}
                                      className="text-xs text-[#888] hover:text-[#333] dark:hover:text-[#ccc]"
                                    >Select all</button>
                                    <button
                                      onClick={() => setSelectedTweets(prev => { const n = new Map(prev); n.set(key, new Set()); return n; })}
                                      className="text-xs text-[#888] hover:text-[#333] dark:hover:text-[#ccc]"
                                    >Deselect all</button>
                                  </div>
                                  {thread.tweets.map(tweet => {
                                    const isChecked = !selected || selected.has(tweet.id_str);
                                    const time = new Date(tweet.created_at).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Toronto' });
                                    return (
                                      <label key={tweet.id_str} className="flex items-start gap-2 py-1 cursor-pointer hover:bg-[#fafaf8] dark:hover:bg-[#111] rounded px-1">
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={() => toggleTweet(key, tweet.id_str)}
                                          className="mt-0.5 flex-shrink-0"
                                        />
                                        <span className={`text-xs break-words flex-1 ${isChecked ? 'text-[#333] dark:text-[#ccc]' : 'text-[#bbb] dark:text-[#444] line-through'}`}>
                                          <span className="text-[#aaa] dark:text-[#555] mr-1">{time}</span>
                                          {tweet.full_text}
                                        </span>
                                      </label>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
