'use client';

import { useState } from 'react';
import AdminShell from '@/components/AdminShell';

// Import tools and occasional maintenance. These were on the main admin
// dashboard during the initial archive backfill; they're rarely needed now.

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

export default function AdminToolsPage() {
  return (
    <AdminShell>
      <AdminTools />
    </AdminShell>
  );
}

function AdminTools() {
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
  // key: meetingKey → Set of rootTweetIds selected for merge (threads ≥5 tweets pre-selected)
  const [selectedMeetingThreads, setSelectedMeetingThreads] = useState<Map<string, Set<string>>>(new Map());
  // One-time migration: backfill `importSource: 'twitter'` onto older Twitter
  // imports so the "Patch quote tweets" action appears for them in Past Sessions.
  const [migratingTwitterSource, setMigratingTwitterSource] = useState(false);
  const [migrateTwitterResult, setMigrateTwitterResult] = useState<string | null>(null);

  // One-time (and re-runnable) backfill: build the precomputed quotes index
  // that powers the "From Past Coverage" random quote on the home page.
  const [buildingQuotesIndex, setBuildingQuotesIndex] = useState(false);
  const [buildQuotesIndexResult, setBuildQuotesIndexResult] = useState<string | null>(null);

  // Reset archive entry dates to their first/last post (fixes threads archived
  // via the live flow that got the click date instead of the meeting date).
  const [repairingDates, setRepairingDates] = useState(false);
  const [repairDatesResult, setRepairDatesResult] = useState<string | null>(null);
  const [repairDatesPreviewed, setRepairDatesPreviewed] = useState(false);

  const [renameOldSlug, setRenameOldSlug] = useState('');
  const [renameNewSlug, setRenameNewSlug] = useState('');
  const [renamingSlug, setRenamingSlug] = useState(false);
  const [renameResult, setRenameResult] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);

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

  // Pre-select threads with ≥5 tweets when a meeting is first expanded.
  // Threads below that threshold are likely stray posts, not coverage.
  const THREAD_PRESELECT_THRESHOLD = 5;

  function initMeetingThreadSelection(meetingKey: string, threads: ProposedThread[]) {
    setSelectedMeetingThreads(prev => {
      if (prev.has(meetingKey)) return prev;
      const next = new Map(prev);
      next.set(meetingKey, new Set(
        threads
          .filter(t => t.tweetCount >= THREAD_PRESELECT_THRESHOLD)
          .map(t => t.rootTweetId)
      ));
      return next;
    });
  }

  function toggleMeetingThread(meetingKey: string, rootTweetId: string) {
    setSelectedMeetingThreads(prev => {
      const next = new Map(prev);
      const set = new Set(prev.get(meetingKey) ?? []);
      if (set.has(rootTweetId)) { set.delete(rootTweetId); } else { set.add(rootTweetId); }
      next.set(meetingKey, set);
      return next;
    });
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
      } else {
        setTwitterError(data.error || 'Import failed.');
      }
    } catch {
      setTwitterError('Network error — try again.');
    } finally {
      setTwitterConfirming(prev => { const s = new Set(prev); s.delete(key); return s; });
    }
  }

  async function handleTwitterMergeSelected(meeting: ProposedMeeting, selectedThreadIds: Set<string>) {
    const key = `${meeting.meetingKey}::merged`;
    const threadsToMerge = meeting.threads.filter(t => selectedThreadIds.has(t.rootTweetId));
    if (threadsToMerge.length < 2) {
      setTwitterError('Select at least two threads to merge.');
      return;
    }
    const allTweets = threadsToMerge
      .flatMap(t => t.tweets)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    setTwitterConfirming(prev => new Set(prev).add(key));
    try {
      const r = await fetch('/api/archive/import/twitter/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingKey: meeting.meetingKey, tweets: allTweets }),
      });
      const data = await r.json();
      if (r.ok && data.slug) {
        setTwitterImported(prev => new Map(prev).set(key, data.slug));
      } else {
        setTwitterError(data.error || 'Merge import failed.');
      }
    } catch {
      setTwitterError('Network error — try again.');
    } finally {
      setTwitterConfirming(prev => { const s = new Set(prev); s.delete(key); return s; });
    }
  }

  async function handleMigrateTwitterSource() {
    setMigratingTwitterSource(true);
    setMigrateTwitterResult(null);
    try {
      const r = await fetch('/api/archive/migrate-twitter-source', { method: 'POST' });
      const data = await r.json();
      if (r.ok) {
        setMigrateTwitterResult(
          data.tagged > 0
            ? `Tagged ${data.tagged} session${data.tagged !== 1 ? 's' : ''} — refresh to see "Patch quote tweets" on them.`
            : 'No untagged Twitter imports found — nothing to do.'
        );
      } else {
        setMigrateTwitterResult(data.error || 'Migration failed.');
      }
    } catch {
      setMigrateTwitterResult('Network error — try again.');
    } finally {
      setMigratingTwitterSource(false);
    }
  }

  async function handleBuildQuotesIndex() {
    setBuildingQuotesIndex(true);
    setBuildQuotesIndexResult(null);
    try {
      const r = await fetch('/api/archive/build-quotes-index', { method: 'POST' });
      const data = await r.json();
      if (r.ok) {
        setBuildQuotesIndexResult(
          `Scanned ${data.sessionsScanned} session${data.sessionsScanned !== 1 ? 's' : ''} — found ${data.candidatesFound} quote${data.candidatesFound !== 1 ? 's' : ''}.`
        );
      } else {
        setBuildQuotesIndexResult(data.error || 'Build failed.');
      }
    } catch {
      setBuildQuotesIndexResult('Network error — try again.');
    } finally {
      setBuildingQuotesIndex(false);
    }
  }

  async function handleRepairDates(dryRun: boolean) {
    setRepairingDates(true);
    setRepairDatesResult(null);
    try {
      const r = await fetch(`/api/archive/repair-dates${dryRun ? '?dryRun=1' : ''}`, { method: 'POST' });
      const data = await r.json();
      if (r.ok) {
        const shown = (data.startChanges as { slug: string; from: string; to: string }[])
          .map(c => `${c.slug}: ${c.from.slice(0, 10)} → ${c.to.slice(0, 10)}`)
          .join('; ');
        const verb = dryRun ? 'Would update' : 'Updated';
        setRepairDatesResult(
          data.updated === 0
            ? `All ${data.scanned} sessions already match their posts — nothing to do.`
            : `${verb} ${data.updated} of ${data.scanned} sessions` +
              (shown ? ` — start date: ${shown}` : '') +
              (data.endedAtOnly ? ` (+${data.endedAtOnly} end-time-only fixes)` : '') + '.'
        );
        setRepairDatesPreviewed(dryRun && data.updated > 0);
      } else {
        setRepairDatesResult(data.error || 'Repair failed.');
      }
    } catch {
      setRepairDatesResult('Network error — try again.');
    } finally {
      setRepairingDates(false);
    }
  }

  async function handleRenameSlug() {
    setRenamingSlug(true);
    setRenameResult(null);
    setRenameError(null);
    try {
      const r = await fetch('/api/archive/rename-slug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldSlug: renameOldSlug.trim(), newSlug: renameNewSlug.trim() }),
      });
      const data = await r.json();
      if (r.ok) {
        setRenameResult(`Renamed "${data.oldSlug}" → "${data.newSlug}" (${data.postCount} posts).`);
        setRenameOldSlug('');
        setRenameNewSlug('');
      } else {
        setRenameError(data.error || 'Rename failed.');
      }
    } catch {
      setRenameError('Network error — try again.');
    } finally {
      setRenamingSlug(false);
    }
  }

  return (
    <>
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

              {/* One-time migration: tag older Twitter imports so "Patch quote tweets" appears for them */}
              <div className="p-2.5 bg-[#fafaf8] dark:bg-[#111] border border-[#f0f0ea] dark:border-[#222] rounded-lg flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs text-[#888] dark:text-[#555]">
                  One-time: tag older Twitter imports so quote-tweet patching is available for them
                  {migrateTwitterResult && (
                    <span className="block mt-0.5 text-[#aaa] dark:text-[#555]">{migrateTwitterResult}</span>
                  )}
                </p>
                <button
                  onClick={handleMigrateTwitterSource}
                  disabled={migratingTwitterSource}
                  className="text-xs font-medium px-2.5 py-1 rounded bg-[#1a1a1a] dark:bg-[#e8e8e0] text-white dark:text-[#111] hover:bg-[#333] disabled:opacity-50 flex-shrink-0 whitespace-nowrap"
                >
                  {migratingTwitterSource ? 'Tagging…' : 'Tag older imports'}
                </button>
              </div>

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
                      onClick={() => {
                        if (expandedTwitterMeeting !== meeting.meetingKey) {
                          initMeetingThreadSelection(meeting.meetingKey, meeting.threads);
                        }
                        setExpandedTwitterMeeting(v => v === meeting.meetingKey ? null : meeting.meetingKey);
                      }}
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
                    {isExpanded && (() => {
                      const checkedThreadIds = selectedMeetingThreads.get(meeting.meetingKey) ?? new Set<string>();
                      const checkedCount = checkedThreadIds.size;
                      const checkedTweetCount = meeting.threads
                        .filter(t => checkedThreadIds.has(t.rootTweetId))
                        .reduce((s, t) => s + t.tweetCount, 0);
                      const mergedKey = `${meeting.meetingKey}::merged`;
                      const mergedSlug = twitterImported.get(mergedKey);
                      const isMerging = twitterConfirming.has(mergedKey);

                      return (
                        <div className="px-3 pb-3 flex flex-col gap-2 border-t border-[#f0f0ea] dark:border-[#222]">

                          {/* Dynamic merge banner — only shown when ≥2 threads are checked */}
                          {meeting.threads.length > 1 && !meeting.alreadyArchived && checkedCount >= 2 && (
                            <div className="mt-2 p-2.5 bg-[#fff8e6] dark:bg-[#2a2000] border border-[#f0d070]/40 dark:border-[#6a5000]/40 rounded-lg flex items-center justify-between gap-3">
                              <p className="text-xs text-[#8a6000] dark:text-[#f0b840]">
                                {checkedCount} threads selected · {checkedTweetCount} tweets
                              </p>
                              {mergedSlug ? (
                                <a href={`/${mergedSlug}`} className="text-xs font-medium text-[#1a6bbf] dark:text-[#5a9fd4] hover:underline flex-shrink-0">
                                  Merged →
                                </a>
                              ) : (
                                <button
                                  onClick={() => handleTwitterMergeSelected(meeting, checkedThreadIds)}
                                  disabled={isMerging}
                                  className="text-xs font-medium px-2.5 py-1 rounded bg-[#8a6000] dark:bg-[#f0b840] text-white dark:text-[#111] hover:bg-[#6a4800] dark:hover:bg-[#ffd060] disabled:opacity-50 flex-shrink-0 whitespace-nowrap"
                                >
                                  {isMerging ? 'Merging…' : 'Merge selected'}
                                </button>
                              )}
                            </div>
                          )}

                          {meeting.threads.map(thread => {
                            const key = `${meeting.meetingKey}::${thread.rootTweetId}`;
                            const importedSlug = twitterImported.get(key);
                            const isConfirming = twitterConfirming.has(key);
                            const isThreadExpanded = expandedTwitterThread === key;
                            const selected = selectedTweets.get(key);
                            const selectedCount = selected ? selected.size : thread.tweetCount;
                            const isThreadChecked = checkedThreadIds.has(thread.rootTweetId);
                            return (
                              <div key={thread.rootTweetId} className="pt-2">
                                <div className="flex items-start gap-2">
                                  {/* Thread-level checkbox — controls merge selection */}
                                  {meeting.threads.length > 1 && !meeting.alreadyArchived && !mergedSlug && (
                                    <input
                                      type="checkbox"
                                      checked={isThreadChecked}
                                      onChange={() => toggleMeetingThread(meeting.meetingKey, thread.rootTweetId)}
                                      className="mt-1 flex-shrink-0 cursor-pointer"
                                      title="Include in merge"
                                    />
                                  )}
                                  <div className="flex-1 min-w-0 flex items-start justify-between gap-2">
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
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Site maintenance */}
        <div className="bg-white dark:bg-[#1a1a1a] border border-[#e0e0d8] dark:border-[#2a2a2a] rounded-xl p-5">
          <p className="text-xs font-medium text-[#888] uppercase tracking-wide mb-4">Site maintenance</p>

          <div className="p-2.5 bg-[#fafaf8] dark:bg-[#111] border border-[#f0f0ea] dark:border-[#222] rounded-lg">
            <p className="text-xs text-[#888] dark:text-[#555] mb-2">
              Rename an archive entry&apos;s slug — moves its posts to the new key and updates the index.
              Useful when a session gets re-captured under a suffixed slug (e.g. after a bug forces a
              delete/redo) and you want the clean URL back.
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="text"
                value={renameOldSlug}
                onChange={e => setRenameOldSlug(e.target.value)}
                placeholder="old-slug"
                className="text-xs px-2 py-1 rounded border border-[#e0e0d8] dark:border-[#2a2a2a] bg-white dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-[#e8e8e0] w-40"
              />
              <span className="text-xs text-[#888]">→</span>
              <input
                type="text"
                value={renameNewSlug}
                onChange={e => setRenameNewSlug(e.target.value)}
                placeholder="new-slug"
                className="text-xs px-2 py-1 rounded border border-[#e0e0d8] dark:border-[#2a2a2a] bg-white dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-[#e8e8e0] w-40"
              />
              <button
                onClick={handleRenameSlug}
                disabled={renamingSlug || !renameOldSlug.trim() || !renameNewSlug.trim()}
                className="text-xs font-medium px-2.5 py-1 rounded bg-[#1a1a1a] dark:bg-[#e8e8e0] text-white dark:text-[#111] hover:bg-[#333] disabled:opacity-50 flex-shrink-0 whitespace-nowrap"
              >
                {renamingSlug ? 'Renaming…' : 'Rename'}
              </button>
            </div>
            {renameError && <p className="text-xs text-[#c0392b] dark:text-[#f08080] mt-1.5">{renameError}</p>}
            {renameResult && <p className="text-xs text-[#aaa] dark:text-[#555] mt-1.5">{renameResult}</p>}
          </div>

          <div className="mt-3 p-2.5 bg-[#fafaf8] dark:bg-[#111] border border-[#f0f0ea] dark:border-[#222] rounded-lg flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-[#888] dark:text-[#555]">
              Rebuild the &quot;From Past Coverage&quot; quote index — speeds up the homepage&apos;s random
              quote feature by precomputing matches instead of scanning the archive on every load.
              New imports are added automatically; re-run this after large backfills or if quotes seem stale.
              {buildQuotesIndexResult && (
                <span className="block mt-0.5 text-[#aaa] dark:text-[#555]">{buildQuotesIndexResult}</span>
              )}
            </p>
            <button
              onClick={handleBuildQuotesIndex}
              disabled={buildingQuotesIndex}
              className="text-xs font-medium px-2.5 py-1 rounded bg-[#1a1a1a] dark:bg-[#e8e8e0] text-white dark:text-[#111] hover:bg-[#333] disabled:opacity-50 flex-shrink-0 whitespace-nowrap"
            >
              {buildingQuotesIndex ? 'Building…' : 'Rebuild quotes index'}
            </button>
          </div>

          <div className="mt-3 p-2.5 bg-[#fafaf8] dark:bg-[#111] border border-[#f0f0ea] dark:border-[#222] rounded-lg flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-[#888] dark:text-[#555]">
              Repair session dates — resets each session&apos;s start/end time to its first and last post.
              Fixes threads archived through Go live that show the archive date instead of the meeting date.
              {repairDatesResult && (
                <span className="block mt-0.5 text-[#aaa] dark:text-[#555]">{repairDatesResult}</span>
              )}
            </p>
            <button
              onClick={() => handleRepairDates(!repairDatesPreviewed)}
              disabled={repairingDates}
              className="text-xs font-medium px-2.5 py-1 rounded bg-[#1a1a1a] dark:bg-[#e8e8e0] text-white dark:text-[#111] hover:bg-[#333] disabled:opacity-50 flex-shrink-0 whitespace-nowrap"
            >
              {repairingDates ? 'Checking…' : repairDatesPreviewed ? 'Apply fixes' : 'Preview date fixes'}
            </button>
          </div>
        </div>
    </>
  );
}
