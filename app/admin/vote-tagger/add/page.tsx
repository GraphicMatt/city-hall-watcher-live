'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getImages, formatTime } from '@/lib/bluesky';
import type { BlueskyPost, VoteCard as VoteCardData } from '@/lib/bluesky';
import type { MinutesVote } from '@/lib/bluesky';
import type { VoteTaggerRow } from '@/app/api/admin/vote-tagger/route';
import VoteCard from '@/components/VoteCard';

type AdminState = 'checking' | 'login' | 'admin';

const PROCEDURAL_RE = /\b(extend|recess|adjourn|waive|dispense|refer|defer|postpone|table)\b/i;

function voteTitle(v: MinutesVote | null): string {
  if (!v) return '';
  const motion = v.motionLabel || '';
  if (PROCEDURAL_RE.test(motion) || PROCEDURAL_RE.test(v.threshold || '')) {
    return motion || v.voteLabel || '';
  }
  return v.itemTitle || motion || v.voteLabel || '';
}

function mayorForTimestamp(timestamp: string | undefined): string {
  if (!timestamp) return 'Chow';
  const year = new Date(timestamp).getFullYear();
  if (year <= 2014) return 'R. Ford';
  if (year <= 2022) return 'Tory';
  return 'Chow';
}

function voteLabel(v: MinutesVote): string {
  const descriptor = v.motionLabel || v.voteLabel || '';
  const time = v.timestamp ? formatTime(v.timestamp) : v.rawDate;
  return `${v.itemNumber} — ${descriptor} · ${v.result} ${v.yesCount}-${v.noCount} · ${time}`;
}

export default function ManualVoteTaggerPage() {
  const [adminState, setAdminState] = useState<AdminState>('checking');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Session + post lookup
  const [sessions, setSessions] = useState<VoteTaggerRow[]>([]);
  const [sessionSlug, setSessionSlug] = useState('');
  const [postRkey, setPostRkey] = useState('');
  const [postLoading, setPostLoading] = useState(false);
  const [postError, setPostError] = useState('');
  const [post, setPost] = useState<BlueskyPost | null>(null);

  // Meeting + vote selection
  const [meetingCode, setMeetingCode] = useState('');
  const [meetingVotes, setMeetingVotes] = useState<MinutesVote[]>([]);
  const [meetingLoading, setMeetingLoading] = useState(false);
  const [meetingError, setMeetingError] = useState('');
  const [selectedVoteId, setSelectedVoteId] = useState('');

  // Card fields
  const [title, setTitle] = useState('');
  const [mayorLastName, setMayorLastName] = useState('Chow');

  // Save
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/auth')
      .then(r => {
        if (r.ok) { setAdminState('admin'); loadSessions(); }
        else setAdminState('login');
      })
      .catch(() => setAdminState('login'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadSessions() {
    const r = await fetch('/api/admin/vote-tagger');
    if (r.ok) {
      const d = await r.json();
      setSessions(d.sessions ?? []);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');
    try {
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!r.ok) { setLoginError('Incorrect password.'); return; }
      setPassword('');
      setAdminState('admin');
      await loadSessions();
    } catch { setLoginError('Something went wrong.'); }
    finally { setLoginLoading(false); }
  }

  async function handleLoadPost(e: React.FormEvent) {
    e.preventDefault();
    setPostError('');
    setPost(null);
    setMeetingVotes([]);
    setSelectedVoteId('');
    setSaved(false);
    if (!sessionSlug || !postRkey) return;

    setPostLoading(true);
    try {
      const r = await fetch(`/api/archive/${sessionSlug}`);
      if (!r.ok) { setPostError('Session not found.'); return; }
      const { posts } = await r.json();
      const found = (posts as BlueskyPost[]).find(p => p.uri.endsWith(postRkey));
      if (!found) { setPostError('Post not found in this session.'); return; }
      setPost(found);

      // Auto-select this session's meeting code if a votes file exists
      const row = sessions.find(s => s.slug === sessionSlug);
      if (row?.meetingCode && row.hasFile) {
        setMeetingCode(row.meetingCode);
        await loadMeetingVotes(row.meetingCode);
      }
    } finally {
      setPostLoading(false);
    }
  }

  async function loadMeetingVotes(code: string) {
    setMeetingError('');
    setMeetingVotes([]);
    setSelectedVoteId('');
    if (!code) return;
    setMeetingLoading(true);
    try {
      const r = await fetch(`/api/admin/votes-file?meeting=${encodeURIComponent(code)}`);
      if (!r.ok) { setMeetingError('No votes file found for this meeting.'); return; }
      const { votes } = await r.json();
      setMeetingVotes(votes as MinutesVote[]);
    } finally {
      setMeetingLoading(false);
    }
  }

  async function handleMeetingChange(code: string) {
    setMeetingCode(code);
    await loadMeetingVotes(code);
  }

  function handleVoteSelect(voteId: string) {
    setSelectedVoteId(voteId);
    const v = meetingVotes.find(v => v.id === voteId);
    if (v) {
      setTitle(voteTitle(v));
      setMayorLastName(mayorForTimestamp(v.timestamp));
    }
    setSaved(false);
  }

  async function handleSave() {
    if (!post || !selectedVote) return;
    setSaving(true);
    try {
      const images = getImages(post);
      const screenshotUrl = images[0]?.fullsize ?? undefined;
      const voteCard: VoteCardData = {
        vote: selectedVote,
        title: title || undefined,
        mayorLastName: mayorLastName || undefined,
        screenshotUrl,
      };
      const r = await fetch(`/api/archive/${sessionSlug}/votes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: [{ postUri: post.uri, voteCard }] }),
      });
      if (r.ok) setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  const selectedVote = meetingVotes.find(v => v.id === selectedVoteId) ?? null;
  const sessionsWithFiles = sessions.filter(s => s.hasFile || s.hasDbVotes);

  if (adminState === 'checking') {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-sm text-chw-tertiary">Loading…</p></div>;
  }

  if (adminState === 'login') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
        <div className="w-full max-w-sm bg-card border border-card-border rounded-xl p-8">
          <h1 className="text-sm font-semibold text-chw-text mb-1">CHW Live Admin</h1>
          <p className="text-xs text-chw-tertiary mb-6">Enter your password to continue.</p>
          <form onSubmit={handleLogin} className="flex flex-col gap-3">
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" autoFocus
              className="text-sm px-3 py-2 border border-border rounded-lg bg-bg text-chw-text placeholder-chw-tertiary outline-none focus:border-chw-secondary transition-colors" />
            {loginError && <p className="text-xs text-vote-lost">{loginError}</p>}
            <button type="submit" disabled={loginLoading}
              className="text-sm font-medium py-2 rounded-lg bg-chw-text text-bg hover:opacity-90 transition-opacity disabled:opacity-50">
              {loginLoading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/vote-tagger" className="text-sm text-chw-tertiary hover:text-chw-secondary transition-colors">← Vote tagger</Link>
        <span className="text-chw-tertiary">/</span>
        <h1 className="text-sm font-semibold text-chw-text">Manual vote attach</h1>
      </div>

      {/* Step 1: Post lookup */}
      <section className="mb-6">
        <h2 className="text-xs font-medium uppercase tracking-wide text-chw-tertiary mb-3">1. Find post</h2>
        <form onSubmit={handleLoadPost} className="flex flex-col gap-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-chw-secondary block mb-1">Session</label>
              <select value={sessionSlug} onChange={e => setSessionSlug(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-border rounded-lg bg-bg text-chw-text outline-none focus:border-chw-secondary">
                <option value="">Select session…</option>
                {sessions.map(s => (
                  <option key={s.slug} value={s.slug}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-chw-secondary block mb-1">Post ID (rkey)</label>
              <input type="text" value={postRkey} onChange={e => setPostRkey(e.target.value.trim())}
                placeholder="3mmcao5usns2y"
                className="w-full text-sm px-3 py-2 border border-border rounded-lg bg-bg text-chw-text placeholder-chw-tertiary outline-none focus:border-chw-secondary" />
            </div>
          </div>
          {postError && <p className="text-xs text-vote-lost">{postError}</p>}
          <button type="submit" disabled={postLoading || !sessionSlug || !postRkey}
            className="self-start text-sm font-medium px-4 py-1.5 rounded-lg bg-chw-text text-bg hover:opacity-90 transition-opacity disabled:opacity-50">
            {postLoading ? 'Loading…' : 'Load post'}
          </button>
        </form>
      </section>

      {post && (
        <>
          {/* Post preview */}
          <div className="mb-6 rounded-lg border border-card-border bg-card px-4 py-3">
            <p className="text-sm text-chw-text whitespace-pre-wrap break-words">{post.record?.text}</p>
            <p className="text-[11px] text-chw-tertiary mt-1">{formatTime(post.indexedAt)}</p>
          </div>

          {/* Step 2: Meeting */}
          <section className="mb-6">
            <h2 className="text-xs font-medium uppercase tracking-wide text-chw-tertiary mb-3">2. Select meeting</h2>
            <select value={meetingCode} onChange={e => handleMeetingChange(e.target.value)}
              className="w-full text-sm px-3 py-2 border border-border rounded-lg bg-bg text-chw-text outline-none focus:border-chw-secondary">
              <option value="">Select meeting…</option>
              {sessionsWithFiles.map(s => (
                <option key={s.slug} value={s.meetingCode ?? ''}>
                  {s.label}{s.meetingCode ? ` (${s.meetingCode})` : ''}
                </option>
              ))}
            </select>
            {meetingError && <p className="text-xs text-vote-lost mt-2">{meetingError}</p>}
            {meetingLoading && <p className="text-xs text-chw-tertiary mt-2">Loading votes…</p>}
          </section>

          {/* Step 3: Vote */}
          {meetingVotes.length > 0 && (
            <section className="mb-6">
              <h2 className="text-xs font-medium uppercase tracking-wide text-chw-tertiary mb-3">
                3. Select vote <span className="normal-case font-normal">({meetingVotes.length} votes in this meeting)</span>
              </h2>
              <select value={selectedVoteId} onChange={e => handleVoteSelect(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-border rounded-lg bg-bg text-chw-text outline-none focus:border-chw-secondary">
                <option value="">Select vote…</option>
                {meetingVotes.map(v => (
                  <option key={v.id} value={v.id}>{voteLabel(v)}</option>
                ))}
              </select>
            </section>
          )}

          {/* Step 4: Customise + preview */}
          {selectedVote && (
            <section className="mb-6">
              <h2 className="text-xs font-medium uppercase tracking-wide text-chw-tertiary mb-3">4. Preview &amp; save</h2>
              <div className="flex gap-3 mb-3">
                <label className="flex-1 text-xs text-chw-secondary">
                  Card title
                  <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                    className="mt-1 w-full text-sm px-2 py-1.5 border border-border rounded bg-bg text-chw-text outline-none focus:border-chw-secondary" />
                </label>
                <label className="w-32 text-xs text-chw-secondary">
                  Mayor&apos;s last name
                  <input type="text" value={mayorLastName} onChange={e => setMayorLastName(e.target.value)}
                    className="mt-1 w-full text-sm px-2 py-1.5 border border-border rounded bg-bg text-chw-text outline-none focus:border-chw-secondary" />
                </label>
              </div>

              <VoteCard card={{ vote: selectedVote, title: title || undefined, mayorLastName: mayorLastName || undefined }} />

              {saved ? (
                <p className="mt-3 text-sm text-vote-carried font-medium">✓ Vote card saved.</p>
              ) : (
                <button onClick={handleSave} disabled={saving}
                  className="mt-3 text-sm font-medium px-4 py-1.5 rounded-lg bg-chw-text text-bg hover:opacity-90 transition-opacity disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save vote card'}
                </button>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
