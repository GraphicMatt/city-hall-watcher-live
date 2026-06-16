import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { ArchiveEntry } from './kv';
import type { MinutesVote } from './bluesky';

interface CouncilMeetingEntry {
  meetingCode: string;
  url: string;
  dates: string[]; // e.g. ["Tuesday, May 20, 2026"]
}

let _councilMeetings: CouncilMeetingEntry[] | null = null;

function getCouncilMeetings(): CouncilMeetingEntry[] {
  if (_councilMeetings) return _councilMeetings;
  try {
    const raw = readFileSync(join(process.cwd(), 'scripts/council-meetings.json'), 'utf-8');
    _councilMeetings = JSON.parse(raw) as CouncilMeetingEntry[];
  } catch {
    _councilMeetings = [];
  }
  return _councilMeetings;
}

// Parse "Tuesday, May 20, 2026" → "2026-05-20", or return null.
function parseMeetingDate(dateStr: string): string | null {
  const MONTHS: Record<string, string> = {
    January: '01', February: '02', March: '03', April: '04',
    May: '05', June: '06', July: '07', August: '08',
    September: '09', October: '10', November: '11', December: '12',
  };
  const m = dateStr.match(/(\w+)\s+(\d+),\s+(\d{4})$/);
  if (!m) return null;
  const mo = MONTHS[m[1]!];
  if (!mo) return null;
  return `${m[3]}-${mo}-${m[2]!.padStart(2, '0')}`;
}

// Extract meetingCode from a minutesUrl, e.g.
// "https://secure.toronto.ca/council/report.do?meeting=2026.CC41&type=minutes" → "2026.CC41"
function meetingCodeFromUrl(url: string): string | null {
  try {
    return new URL(url).searchParams.get('meeting');
  } catch {
    return null;
  }
}

// Parse "may-20-2026" → "2026-05-20". More reliable than startedAt, which
// reflects indexing time rather than the first day of the meeting.
function slugToDate(slug: string): string | null {
  const MONTHS: Record<string, string> = {
    january: '01', february: '02', march: '03', april: '04',
    may: '05', june: '06', july: '07', august: '08',
    september: '09', october: '10', november: '11', december: '12',
  };
  const m = slug.match(/^([a-z]+)-(\d+)-(\d{4})/);
  if (!m) return null;
  const mo = MONTHS[m[1]!];
  if (!mo) return null;
  return `${m[3]}-${mo}-${m[2]!.padStart(2, '0')}`;
}

// Look up the meetingCode for a session slug.
// Tries minutesUrl first, then date-matches against council-meetings.json
// using the date encoded in the slug (e.g. "may-20-2026" → "2026-05-20").
export function meetingCodeForSlug(slug: string, entries: ArchiveEntry[]): string | null {
  const entry = entries.find(e => e.slug === slug);
  if (!entry) return null;

  if (entry.metadata?.minutesUrl) {
    const code = meetingCodeFromUrl(entry.metadata.minutesUrl);
    if (code) return code;
  }

  const sessionDate = slugToDate(slug);
  if (!sessionDate) return null;

  const meetings = getCouncilMeetings();
  for (const m of meetings) {
    for (const d of m.dates) {
      if (parseMeetingDate(d) === sessionDate) return m.meetingCode;
    }
  }
  return null;
}

const VOTES_DIR = join(process.cwd(), 'data/votes');

export function localVotesPath(meetingCode: string): string {
  return join(VOTES_DIR, `${meetingCode}.json`);
}

export function localVotesExist(meetingCode: string): boolean {
  return existsSync(localVotesPath(meetingCode));
}

// Read votes from a committed data/votes/{meetingCode}.json file.
// Returns null if the file doesn't exist or can't be parsed.
export function readLocalVotes(meetingCode: string): MinutesVote[] | null {
  const path = localVotesPath(meetingCode);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    const votes: unknown = Array.isArray(raw) ? raw : raw?.votes;
    return Array.isArray(votes) ? (votes as MinutesVote[]) : null;
  } catch {
    return null;
  }
}
