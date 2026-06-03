import { readFileSync } from 'fs';
import { join } from 'path';

export interface CouncilMeeting {
  term: string;
  mtgNum: string;
  dates: string[];      // YYYY-MM-DD, sorted ascending
  meetingLabel: string; // e.g. "City Council — November 2022"
}

// Lazy-cached results
let _meetings: CouncilMeeting[] | null = null;
let _dateSet: Set<string> | null = null;
let _dateToMeeting: Map<string, CouncilMeeting> | null = null;

const CSV_FILES = [
  'meeting-schedule-all-committees-2010-2014.csv',
  'meeting-schedule-all-committees-2014-2018.csv',
  'meeting-schedule-all-committees-2018-2022.csv',
  'meeting-schedule-all-committees-2022-2026-3.csv',
];

function parseCSV(content: string): Record<string, string>[] {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];

  // Parse header, handling quoted fields
  const headers = parseCSVLine(lines[0]!);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]!);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = (values[idx] ?? '').trim();
    });
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let inQuote = false;
  let current = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// Normalize row field names across CSV file versions
function getField(row: Record<string, string>, ...names: string[]): string {
  for (const name of names) {
    if (row[name] !== undefined) return row[name]!;
  }
  return '';
}

function buildMeetingLabel(dates: string[]): string {
  if (dates.length === 0) return 'City Council';
  // Use the first date for the label
  const d = new Date(dates[0]! + 'T12:00:00Z');
  const month = d.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  const year = d.getUTCFullYear();
  return `City Council — ${month} ${year}`;
}

function computeMeetings(): CouncilMeeting[] {
  const councilDir = join(process.cwd(), 'council-dates');

  // term+mtgNum → dates[]
  const meetingMap = new Map<string, { term: string; mtgNum: string; dates: Set<string> }>();

  for (const file of CSV_FILES) {
    const content = readFileSync(join(councilDir, file), 'utf-8');
    const rows = parseCSV(content);

    for (const row of rows) {
      const committee = getField(row, 'Committee');
      if (committee !== 'City Council') continue;

      const term = getField(row, 'Term');
      const mtgNum = getField(row, 'MTG #', 'MTGNum');
      const date = getField(row, 'Date');

      if (!date || !mtgNum) continue;

      const key = `${term}||${mtgNum}`;
      if (!meetingMap.has(key)) {
        meetingMap.set(key, { term, mtgNum, dates: new Set() });
      }
      meetingMap.get(key)!.dates.add(date);
    }
  }

  return Array.from(meetingMap.values())
    .map(({ term, mtgNum, dates }) => {
      const sortedDates = Array.from(dates).sort();
      return {
        term,
        mtgNum,
        dates: sortedDates,
        meetingLabel: buildMeetingLabel(sortedDates),
      };
    })
    .sort((a, b) => (a.dates[0] ?? '') < (b.dates[0] ?? '') ? -1 : 1);
}

export function loadCouncilMeetings(): CouncilMeeting[] {
  if (!_meetings) {
    _meetings = computeMeetings();
    _dateToMeeting = new Map();
    _dateSet = new Set();
    for (const m of _meetings) {
      for (const d of m.dates) {
        _dateSet.add(d);
        _dateToMeeting.set(d, m);
      }
    }
  }
  return _meetings;
}

export function councilDateSet(): Set<string> {
  if (!_dateSet) loadCouncilMeetings();
  return _dateSet!;
}

export function getMeetingForDate(date: string): CouncilMeeting | null {
  if (!_dateToMeeting) loadCouncilMeetings();
  return _dateToMeeting!.get(date) ?? null;
}

export function getMeetingByKey(meetingKey: string): CouncilMeeting | null {
  const meetings = loadCouncilMeetings();
  return meetings.find(m => `${m.term}||${m.mtgNum}` === meetingKey) ?? null;
}
