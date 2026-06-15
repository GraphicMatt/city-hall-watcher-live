import type { BlueskyPost, MinutesVote } from './bluesky';

// Matches vote-result announcements like "CARRIES 22-2", "FAILS 10-15",
// "PASSES 13-12", "LOST 5-20", "is APPROVED 21-2", "is UPHELD, 19-5", "is
// ADDED to the agenda on an 18-3 vote". The result word can appear anywhere
// before the margin (e.g. "...CARRIES 22-2." or "Motion FAILS, 10-15").
const VOTE_RESULT_RE = /\b(CARRIES?|CARRY|CARRIED|PASSES?|PASSED|FAILS?|FAILED|LOST|APPROVED?|ADOPT(?:ED)?|ADDED|UPHELD|REJECTED|DEFEATED|DENIED|CONFIRMED)\b[^\d]{0,40}?(\d+)\s*[-–—]\s*(\d+)/i;

// Matches "Council votes 24-0 to APPROVE...", "they vote 20-1 to APPROVE...",
// "Council votes 20-2 to intervene..." — phrasing where the margin precedes
// the verb describing the (successful) action taken.
const VOTE_TO_RE = /\bvotes?\b\s+(\d+)\s*[-–—]\s*(\d+)\s+to\b/i;

const CARRIED_WORDS = new Set([
  'CARRIES', 'CARRY', 'CARRIED', 'PASSES', 'PASS', 'PASSED',
  'APPROVE', 'APPROVED', 'ADOPT', 'ADOPTED', 'ADDED', 'UPHELD', 'CONFIRMED',
]);

export type VoteResult = 'Carried' | 'Lost';

export interface VoteAnnouncement {
  postUri: string;
  postText: string;
  postTime: string; // post.indexedAt
  detectedResult: VoteResult;
  yesCount: number;
  noCount: number;
}

export interface VoteMatchCandidate {
  vote: MinutesVote;
  deltaMinutes: number; // postTime - vote.timestamp, in minutes (can be negative)
  resultMismatch: boolean;
}

export interface VoteCandidatePost {
  announcement: VoteAnnouncement;
  matches: VoteMatchCandidate[];
}

const MAX_WINDOW_MINUTES = 60;

// Scans posts for vote-result announcements. Skips posts that already have a
// voteCard attached (already reviewed/matched).
export function detectVoteAnnouncements(posts: BlueskyPost[]): VoteAnnouncement[] {
  const out: VoteAnnouncement[] = [];
  for (const post of posts) {
    if (post.voteCard) continue;
    const text = post.record?.text || '';
    const m = VOTE_RESULT_RE.exec(text);
    if (m) {
      const word = m[1]!.toUpperCase();
      const detectedResult: VoteResult = CARRIED_WORDS.has(word) ? 'Carried' : 'Lost';
      out.push({
        postUri: post.uri,
        postText: text,
        postTime: post.indexedAt,
        detectedResult,
        yesCount: parseInt(m[2]!, 10),
        noCount: parseInt(m[3]!, 10),
      });
      continue;
    }

    const m2 = VOTE_TO_RE.exec(text);
    if (m2) {
      out.push({
        postUri: post.uri,
        postText: text,
        postTime: post.indexedAt,
        detectedResult: 'Carried',
        yesCount: parseInt(m2[1]!, 10),
        noCount: parseInt(m2[2]!, 10),
      });
    }
  }
  return out;
}

// Finds Minutes votes whose yes/no margin matches the announcement (in
// either order, since the post's "winning-losing" order may not line up
// with the Minutes' yes/no order) and whose timestamp falls within
// MAX_WINDOW_MINUTES of the post. Ranked by time proximity; exact
// result-word matches are not required but mismatches are flagged.
export function findCandidateMatches(
  announcement: VoteAnnouncement,
  votes: MinutesVote[],
): VoteMatchCandidate[] {
  const postTime = new Date(announcement.postTime).getTime();
  const announcedPair = new Set([announcement.yesCount, announcement.noCount]);

  const candidates: VoteMatchCandidate[] = [];
  for (const vote of votes) {
    if (!vote.timestamp) continue;
    const votePair = new Set([vote.yesCount, vote.noCount]);
    if (votePair.size !== announcedPair.size) continue;
    if (![...votePair].every(n => announcedPair.has(n))) continue;

    const voteTime = new Date(vote.timestamp).getTime();
    const deltaMinutes = (postTime - voteTime) / 60000;
    if (Math.abs(deltaMinutes) > MAX_WINDOW_MINUTES) continue;

    candidates.push({
      vote,
      deltaMinutes,
      resultMismatch: vote.result !== announcement.detectedResult,
    });
  }

  candidates.sort((a, b) => Math.abs(a.deltaMinutes) - Math.abs(b.deltaMinutes));
  return candidates;
}

// The threshold cell reads like "Majority Required - DM41.2 - Matlow - motion
// 2" or "Two-Thirds Required - MM41.4 - Waive the referral". Strip the
// requirement and item-number prefix to get the motion descriptor — used as
// a fallback for votes scraped before motionLabel was populated directly.
export function deriveMotionLabel(threshold: string): string {
  const parts = threshold.split(' - ').map(p => p.trim()).filter(Boolean);
  return parts.length >= 3 ? parts.slice(2).join(' - ') : '';
}

// Builds a link to the agenda-item page for a Minutes vote, e.g.
// https://secure.toronto.ca/council/agenda-item.do?item=2026.DM41.3 — the
// year comes from the vote's timestamp since it isn't otherwise tracked.
export function agendaItemUrl(vote: MinutesVote): string | null {
  if (!vote.itemNumber || !vote.timestamp) return null;
  const year = new Date(vote.timestamp).getFullYear();
  return `https://secure.toronto.ca/council/agenda-item.do?item=${year}.${vote.itemNumber}`;
}

// Convenience: runs detection + matching for a whole session.
export function matchVotesToPosts(posts: BlueskyPost[], votes: MinutesVote[]): VoteCandidatePost[] {
  return detectVoteAnnouncements(posts).map(announcement => ({
    announcement,
    matches: findCandidateMatches(announcement, votes),
  }));
}
