import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readLocalVotes } from '@/lib/voteFiles';

// GET /api/admin/votes-file?meeting=2026.CC41
// Serves the scraped votes from a committed data/votes/{meetingCode}.json file.
export async function GET(request: NextRequest) {
  const meeting = request.nextUrl.searchParams.get('meeting');
  if (!meeting) {
    return NextResponse.json({ error: 'meeting param required' }, { status: 400 });
  }
  const votes = readLocalVotes(meeting);
  if (!votes) {
    return NextResponse.json({ error: 'No votes file found for this meeting' }, { status: 404 });
  }
  return NextResponse.json({ votes });
}
