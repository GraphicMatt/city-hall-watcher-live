#!/usr/bin/env node
// Backfills agendaUrl + minutesUrl metadata for archived council sessions by
// matching each archive entry's post dates against the scraped toronto.ca
// meeting database in council-meetings.json.
//
// Dry run (default — no writes):
//   npx tsx --env-file=.env.local scripts/backfill-council-metadata.mts
//
// Write matched entries to KV:
//   npx tsx --env-file=.env.local scripts/backfill-council-metadata.mts --write
//
// Overwrite entries that already have metadata set:
//   npx tsx --env-file=.env.local scripts/backfill-council-metadata.mts --write --force

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getArchiveIndex, getArchivePosts, updateArchiveEntry } from '../lib/kv.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WRITE = process.argv.includes('--write');
const FORCE = process.argv.includes('--force');
const TORONTO_TZ = 'America/Toronto';
const BASE_URL = 'https://secure.toronto.ca/council/report.do';

interface CouncilMeeting {
  meetingCode: string;
  url: string;
  meetingNumber: string | null;
  sessions: { date: string }[];
  term: string | null;
  cancelled?: boolean;
}

function toTorontoDateStr(isoString: string): string {
  // Returns YYYY-MM-DD in Toronto local time
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    timeZone: TORONTO_TZ,
  }).formatToParts(new Date(isoString));
  return `${parts.find(p => p.type === 'year')!.value}-${parts.find(p => p.type === 'month')!.value}-${parts.find(p => p.type === 'day')!.value}`;
}

function buildUrls(meetingCode: string) {
  return {
    minutesUrl: `${BASE_URL}?meeting=${meetingCode}&type=minutes`,
    agendaUrl: `${BASE_URL}?meeting=${meetingCode}&type=agenda`,
  };
}

async function main() {
  // Load council meetings lookup
  const allMeetings: CouncilMeeting[] = JSON.parse(
    readFileSync(join(__dirname, 'council-meetings.json'), 'utf8')
  );

  // Build a map from ISO date → list of meetings that had a session on that date
  const dateToMeetings = new Map<string, CouncilMeeting[]>();
  for (const meeting of allMeetings) {
    if (meeting.cancelled || meeting.sessions.length === 0) continue;
    for (const session of meeting.sessions) {
      if (!session.date) continue;
      const existing = dateToMeetings.get(session.date) ?? [];
      // Avoid duplicating the same meeting (multiple sessions same day)
      if (!existing.some(m => m.meetingCode === meeting.meetingCode)) {
        existing.push(meeting);
      }
      dateToMeetings.set(session.date, existing);
    }
  }

  const archiveIndex = await getArchiveIndex();
  console.log(`Archive entries: ${archiveIndex.length}  |  Council meetings with data: ${allMeetings.filter(m => m.sessions.length > 0 && !m.cancelled).length}\n`);

  type Result =
    | { status: 'match'; entry: typeof archiveIndex[0]; meeting: CouncilMeeting; alreadySet: boolean }
    | { status: 'ambiguous'; entry: typeof archiveIndex[0]; candidates: CouncilMeeting[] }
    | { status: 'no_match'; entry: typeof archiveIndex[0] }
    | { status: 'skipped'; entry: typeof archiveIndex[0]; reason: string };

  const results: Result[] = [];
  let processed = 0;

  for (const entry of archiveIndex) {
    process.stdout.write(`\r  Loading posts... ${++processed}/${archiveIndex.length}`);

    const posts = await getArchivePosts(entry.slug);
    if (!posts || posts.length === 0) {
      results.push({ status: 'no_match', entry });
      continue;
    }

    // Collect unique Toronto-local calendar dates from post timestamps
    const postDates = new Set(posts.map(p => toTorontoDateStr(p.indexedAt)));

    // Find all distinct CC meetings whose session dates overlap with our post dates
    const matchedMeetings = new Map<string, CouncilMeeting>();
    for (const date of postDates) {
      for (const meeting of dateToMeetings.get(date) ?? []) {
        matchedMeetings.set(meeting.meetingCode, meeting);
      }
    }

    const alreadySet = !!(entry.metadata?.minutesUrl || entry.metadata?.agendaUrl);

    if (matchedMeetings.size === 0) {
      results.push({ status: 'no_match', entry });
    } else if (matchedMeetings.size === 1) {
      const meeting = [...matchedMeetings.values()][0]!;
      results.push({ status: 'match', entry, meeting, alreadySet });
    } else {
      results.push({ status: 'ambiguous', entry, candidates: [...matchedMeetings.values()] });
    }
  }
  process.stdout.write('\r' + ' '.repeat(50) + '\r');

  // --- Print report ---
  const matches = results.filter(r => r.status === 'match') as Extract<Result, { status: 'match' }>[];
  const newMatches = matches.filter(r => !r.alreadySet);
  const alreadySet = matches.filter(r => r.alreadySet);
  const ambiguous = results.filter(r => r.status === 'ambiguous') as Extract<Result, { status: 'ambiguous' }>[];
  const noMatch = results.filter(r => r.status === 'no_match') as Extract<Result, { status: 'no_match' }>[];

  console.log(`Results: ${newMatches.length} new matches, ${alreadySet.length} already set, ${ambiguous.length} ambiguous, ${noMatch.length} no match\n`);

  if (newMatches.length > 0) {
    console.log('─── New matches ───────────────────────────────────────────────────────');
    for (const r of newMatches) {
      const { minutesUrl, agendaUrl } = buildUrls(r.meeting.meetingCode);
      const isSpecial = r.meeting.meetingNumber?.includes('Special') ? ' [Special]' : '';
      const dates = r.meeting.sessions.map(s => s.date);
      const dateRange = dates.length === 1 ? dates[0] : `${dates[0]} – ${dates[dates.length - 1]}`;
      console.log(`✓  ${r.entry.slug.padEnd(40)} ${r.meeting.meetingCode}${isSpecial}`);
      console.log(`   ${dateRange}`);
      console.log(`   ${minutesUrl}`);
    }
  }

  if (ambiguous.length > 0) {
    console.log('\n─── Ambiguous (manual review needed) ──────────────────────────────────');
    for (const r of ambiguous) {
      const codes = r.candidates.map(c => {
        const isSpecial = c.meetingNumber?.includes('Special') ? '(S)' : '';
        return `${c.meetingCode}${isSpecial}`;
      }).join(', ');
      console.log(`⚠   ${r.entry.slug.padEnd(40)} candidates: ${codes}`);
    }
  }

  if (alreadySet.length > 0) {
    console.log('\n─── Already have metadata (skipped unless --force) ─────────────────────');
    for (const r of alreadySet) {
      console.log(`–   ${r.entry.slug.padEnd(40)} ${r.meeting.meetingCode}`);
    }
  }

  if (noMatch.length > 0) {
    console.log('\n─── No match found ─────────────────────────────────────────────────────');
    for (const r of noMatch) {
      console.log(`✗   ${r.entry.slug}`);
    }
  }

  // --- Write to KV if --write ---
  if (WRITE) {
    const toWrite = FORCE ? matches : newMatches;
    if (toWrite.length === 0) {
      console.log('\nNothing to write.');
      return;
    }
    console.log(`\nWriting ${toWrite.length} entries to KV...`);
    let written = 0;
    for (const r of toWrite) {
      const { minutesUrl, agendaUrl } = buildUrls(r.meeting.meetingCode);
      await updateArchiveEntry(r.entry.slug, {
        metadata: {
          ...r.entry.metadata,
          minutesUrl,
          agendaUrl,
        },
      });
      process.stdout.write(`\r  ${++written}/${toWrite.length}`);
    }
    console.log(`\r  Done — ${written} entries updated.`);
  } else {
    console.log(`\n(Dry run — pass --write to commit to KV.)`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
