import { NextResponse } from 'next/server';
import { getArchivePosts, setArchivePosts } from '@/lib/kv';

const SLUG = 'july-7-2014';

// One-off editorial correction: update pronouns for @neville_park — a subject
// of this thread — from she/her to they/them, reflecting their current
// identity. Scoped to four specific posts with exact before/after text; none
// of them contain link facets, so this is a plain text swap with no byte-
// offset recalculation needed. Idempotent — skips posts whose text has already
// been updated, and reports (without changing) any post whose text doesn't
// match the expected "before" string, in case it was hand-edited in the
// meantime. Delete this route + its admin trigger once it's been run.
const REPLACEMENTS: Record<string, { before: string; after: string }> = {
  '486157700271968256': {
    before: '.@neville_park is up now, making her pitch to councillors to be appointed councillor in Ward 20.',
    after: '.@neville_park is up now, making their pitch to councillors to be appointed councillor in Ward 20.',
  },
  '486158567066845184': {
    before: '.@neville_park says she isn\'t a "paid union stooge" or a journalist. Covers city hall obsessively because "I just love this place."',
    after: '.@neville_park says they aren\'t a "paid union stooge" or a journalist. Covers city hall obsessively because "I just love this place."',
  },
  '486159021565804546': {
    before: "Doug Ford says he loves @neville_park's sense of humour and her analogies. But he won't vote for her.",
    after: "Doug Ford says he loves @neville_park's sense of humour and their analogies. But he won't vote for them.",
  },
  '486159437712076800': {
    before: 'Councillor McMahon asks @neville_park how she feels about @downtownginny. Everyone is having a good time.',
    after: 'Councillor McMahon asks @neville_park how they feel about @downtownginny. Everyone is having a good time.',
  },
};

export async function POST() {
  const posts = await getArchivePosts(SLUG);
  if (!posts) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  let patched = 0;
  let alreadyDone = 0;
  let unexpectedText = 0;

  const updated = posts.map(post => {
    const postId = post.uri.split('/').pop()!;
    const replacement = REPLACEMENTS[postId];
    if (!replacement) return post;

    const currentText = post.record?.text ?? '';
    if (currentText === replacement.after) { alreadyDone++; return post; }
    if (currentText !== replacement.before) { unexpectedText++; return post; }

    patched++;
    return { ...post, record: { ...post.record, text: replacement.after } };
  });

  if (patched > 0) await setArchivePosts(SLUG, updated);
  return NextResponse.json({ ok: true, patched, alreadyDone, unexpectedText });
}
