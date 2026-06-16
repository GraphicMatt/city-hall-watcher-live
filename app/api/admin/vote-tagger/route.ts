import { NextResponse } from 'next/server';
import { getArchiveIndex, getMinutesVotes } from '@/lib/kv';
import { meetingCodeForSlug, localVotesExist } from '@/lib/voteFiles';

export interface VoteTaggerRow {
  slug: string;
  label: string;
  startedAt: string;
  postCount: number;
  meetingCode: string | null;
  minutesUrl: string | null;
  hasFile: boolean;
  hasDbVotes: boolean;
}

// Returns all archive sessions enriched with vote-processing status so the
// /admin/vote-tagger page can show which meetings still need work.
export async function GET() {
  const index = await getArchiveIndex();
  const sorted = [...index].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );

  const rows = await Promise.all(
    sorted.map(async (entry): Promise<VoteTaggerRow> => {
      const meetingCode = meetingCodeForSlug(entry.slug, index);
      const [dbVotes, hasFile] = await Promise.all([
        getMinutesVotes(entry.slug),
        Promise.resolve(meetingCode ? localVotesExist(meetingCode) : false),
      ]);
      return {
        slug: entry.slug,
        label: entry.label,
        startedAt: entry.startedAt,
        postCount: entry.postCount,
        meetingCode,
        minutesUrl: entry.metadata?.minutesUrl ?? null,
        hasFile,
        hasDbVotes: dbVotes !== null && dbVotes.length > 0,
      };
    })
  );

  return NextResponse.json({ sessions: rows });
}
