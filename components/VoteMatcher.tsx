'use client';

import { useEffect, useState } from 'react';
import { getImages, formatTime } from '@/lib/bluesky';
import type { BlueskyPost, VoteCard as VoteCardData } from '@/lib/bluesky';
import { agendaItemUrl, deriveMotionLabel } from '@/lib/voteMatching';
import type { VoteCandidatePost } from '@/lib/voteMatching';
import VoteCard from './VoteCard';

type AdminState = 'checking' | 'login' | 'admin';

const DEFAULT_MAYOR = 'Chow';

interface Selection {
  matchIndex: number | null; // null = "no match selected" — Save is disabled
  title: string;
  mayorLastName: string;
}

function defaultSelection(candidate: VoteCandidatePost): Selection {
  const matchIndex = candidate.matches.length === 1 ? 0 : null;
  const vote = matchIndex !== null ? candidate.matches[matchIndex]!.vote : null;
  return {
    matchIndex,
    title: vote ? (vote.itemTitle || vote.motionLabel || vote.voteLabel) : '',
    mayorLastName: DEFAULT_MAYOR,
  };
}

export default function VoteMatcher({ slug }: { slug: string }) {
  const [adminState, setAdminState] = useState<AdminState>('checking');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);

  const [posts, setPosts] = useState<BlueskyPost[]>([]);
  const [candidates, setCandidates] = useState<VoteCandidatePost[]>([]);
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [savedUris, setSavedUris] = useState<Set<string>>(new Set());

  const [jsonInput, setJsonInput] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [savingUri, setSavingUri] = useState<string | null>(null);

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
    const [archiveRes, votesRes] = await Promise.all([
      fetch(`/api/archive/${slug}`),
      fetch(`/api/archive/${slug}/votes`),
    ]);
    if (archiveRes.ok) {
      const data = await archiveRes.json();
      setPosts(data.posts ?? []);
    }
    if (votesRes.ok) {
      const data = await votesRes.json();
      applyCandidates(data.candidates ?? []);
    }
  }

  function applyCandidates(newCandidates: VoteCandidatePost[]) {
    setCandidates(newCandidates);
    setSelections(prev => {
      const next = { ...prev };
      for (const c of newCandidates) {
        if (!next[c.announcement.postUri]) {
          next[c.announcement.postUri] = defaultSelection(c);
        }
      }
      return next;
    });
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

  async function handleUpload() {
    setUploadError('');
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonInput);
    } catch {
      setUploadError('Not valid JSON.');
      return;
    }
    const votes = Array.isArray(parsed)
      ? parsed
      : (parsed as { votes?: unknown }).votes;
    if (!Array.isArray(votes)) {
      setUploadError('Expected an array of votes, or { "votes": [...] } as output by chw_minutes_scraper.py.');
      return;
    }

    setUploading(true);
    try {
      const r = await fetch(`/api/archive/${slug}/votes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ votes }),
      });
      if (!r.ok) {
        setUploadError('Upload failed — check the server logs.');
        return;
      }
      const data = await r.json();
      applyCandidates(data.candidates ?? []);
    } finally {
      setUploading(false);
    }
  }

  function updateSelection(postUri: string, patch: Partial<Selection>) {
    setSelections(prev => ({ ...prev, [postUri]: { ...prev[postUri]!, ...patch } }));
  }

  function selectMatch(candidate: VoteCandidatePost, matchIndex: number | null) {
    const postUri = candidate.announcement.postUri;
    const vote = matchIndex !== null ? candidate.matches[matchIndex]!.vote : null;
    updateSelection(postUri, {
      matchIndex,
      title: vote ? (vote.itemTitle || vote.motionLabel || vote.voteLabel) : '',
    });
  }

  async function handleSave(candidate: VoteCandidatePost) {
    const postUri = candidate.announcement.postUri;
    const sel = selections[postUri];
    if (!sel || sel.matchIndex === null) return;
    const vote = candidate.matches[sel.matchIndex]!.vote;

    const voteCard: VoteCardData = {
      vote,
      title: sel.title || undefined,
      mayorLastName: sel.mayorLastName || undefined,
    };

    setSavingUri(postUri);
    try {
      const r = await fetch(`/api/archive/${slug}/votes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: [{ postUri, voteCard }] }),
      });
      if (r.ok) {
        setSavedUris(prev => new Set(prev).add(postUri));
        setCandidates(prev => prev.filter(c => c.announcement.postUri !== postUri));
      }
    } finally {
      setSavingUri(null);
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

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-lg font-semibold text-chw-text mb-1">Match votes — {slug}</h1>
      <p className="text-sm text-chw-secondary mb-6">
        Paste the JSON produced by <code className="font-mono text-xs">chw_minutes_scraper.py</code> below,
        then review and confirm each vote-result post.
      </p>

      <div className="mb-8">
        <textarea
          value={jsonInput}
          onChange={e => setJsonInput(e.target.value)}
          placeholder='{ "votes": [ ... ] }'
          rows={6}
          className="w-full text-xs font-mono px-3 py-2 border border-border rounded-lg bg-card text-chw-text placeholder-chw-tertiary outline-none focus:border-chw-secondary transition-colors"
        />
        {uploadError && <p className="text-xs text-vote-lost mt-1.5">{uploadError}</p>}
        <button
          onClick={handleUpload}
          disabled={uploading || !jsonInput.trim()}
          className="mt-2 text-sm font-medium px-4 py-1.5 rounded-lg bg-chw-text text-bg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {uploading ? 'Loading…' : 'Load votes'}
        </button>
      </div>

      {candidates.length === 0 ? (
        <p className="text-sm text-chw-tertiary">
          No unresolved vote-result posts found. Upload Minutes votes above, or all detected votes have been matched.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {candidates.map(candidate => {
            const postUri = candidate.announcement.postUri;
            const sel = selections[postUri] ?? defaultSelection(candidate);
            const post = posts.find(p => p.uri === postUri);
            const images = post ? getImages(post) : [];
            const selectedVote = sel.matchIndex !== null ? candidate.matches[sel.matchIndex]!.vote : null;

            return (
              <div key={postUri} className="rounded-lg border border-card-border bg-card p-4">
                <p className="text-sm text-chw-text whitespace-pre-wrap break-words mb-1">
                  {candidate.announcement.postText}
                </p>
                <p className="text-[11px] text-chw-tertiary mb-3">
                  Posted {formatTime(candidate.announcement.postTime)} · detected{' '}
                  {candidate.announcement.detectedResult.toLowerCase()} {candidate.announcement.yesCount}-
                  {candidate.announcement.noCount}
                  {images.length > 0 && (
                    <>
                      {' · '}
                      <a href={images[0]!.fullsize} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        original screenshot
                      </a>
                    </>
                  )}
                </p>

                {candidate.matches.length === 0 ? (
                  <p className="text-sm text-vote-lost">
                    No matching vote found in the uploaded Minutes within ±60 minutes. The Minutes may not be
                    published yet, or the margin/result didn&apos;t match anything.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2 mb-3">
                    {candidate.matches.map((m, i) => (
                      <label
                        key={m.vote.id}
                        className="flex items-start gap-2 text-sm text-chw-text cursor-pointer rounded border border-border px-3 py-2 hover:border-chw-secondary transition-colors"
                      >
                        <input
                          type="radio"
                          name={`match-${postUri}`}
                          checked={sel.matchIndex === i}
                          onChange={() => selectMatch(candidate, i)}
                          className="mt-1"
                        />
                        <span>
                          <strong>{m.vote.itemNumber}</strong> — {m.vote.itemTitle || m.vote.motionLabel || m.vote.voteLabel}
                          {agendaItemUrl(m.vote) && (
                            <>
                              {' '}
                              <a
                                href={agendaItemUrl(m.vote)!}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="text-xs text-brand-blue dark:text-blue-400 hover:underline"
                              >
                                open item ↗
                              </a>
                            </>
                          )}
                          <br />
                          <span className="text-xs text-chw-secondary">
                            {m.vote.result} {m.vote.yesCount}-{m.vote.noCount}
                            {m.vote.absentCount ? `-${m.vote.absentCount}` : ''} ·{' '}
                            {m.vote.timestamp ? formatTime(m.vote.timestamp) : m.vote.rawDate} ·{' '}
                            {Math.round(m.deltaMinutes)}min {m.deltaMinutes >= 0 ? 'after' : 'before'} this post
                            {m.resultMismatch && (
                              <span className="text-vote-lost"> · result mismatch — check carefully</span>
                            )}
                          </span>
                          {(() => {
                            const motion = m.vote.motionLabel || deriveMotionLabel(m.vote.threshold);
                            return motion ? (
                              <>
                                <br />
                                <span className="text-xs font-medium text-chw-secondary">{motion}</span>
                              </>
                            ) : null;
                          })()}
                        </span>
                      </label>
                    ))}
                    <label className="flex items-center gap-2 text-sm text-chw-secondary cursor-pointer px-3 py-1">
                      <input
                        type="radio"
                        name={`match-${postUri}`}
                        checked={sel.matchIndex === null}
                        onChange={() => selectMatch(candidate, null)}
                      />
                      None of these / skip for now
                    </label>
                  </div>
                )}

                {selectedVote && (
                  <>
                    <div className="flex gap-3 mb-3">
                      <label className="flex-1 text-xs text-chw-secondary">
                        Card title
                        <input
                          type="text"
                          value={sel.title}
                          onChange={e => updateSelection(postUri, { title: e.target.value })}
                          className="mt-1 w-full text-sm px-2 py-1.5 border border-border rounded bg-bg text-chw-text outline-none focus:border-chw-secondary"
                        />
                      </label>
                      <label className="w-32 text-xs text-chw-secondary">
                        Mayor&apos;s last name
                        <input
                          type="text"
                          value={sel.mayorLastName}
                          onChange={e => updateSelection(postUri, { mayorLastName: e.target.value })}
                          className="mt-1 w-full text-sm px-2 py-1.5 border border-border rounded bg-bg text-chw-text outline-none focus:border-chw-secondary"
                        />
                      </label>
                    </div>

                    <VoteCard card={{ vote: selectedVote, title: sel.title, mayorLastName: sel.mayorLastName }} />
                  </>
                )}

                <button
                  onClick={() => handleSave(candidate)}
                  disabled={sel.matchIndex === null || savingUri === postUri}
                  className="mt-3 text-sm font-medium px-4 py-1.5 rounded-lg bg-chw-text text-bg hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {savingUri === postUri ? 'Saving…' : 'Save vote card'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {savedUris.size > 0 && (
        <p className="text-xs text-chw-tertiary mt-6">{savedUris.size} vote card(s) saved this session.</p>
      )}
    </div>
  );
}
