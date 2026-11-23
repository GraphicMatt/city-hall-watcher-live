import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSpecialEntry, deleteSpecialThread } from '@/lib/kv';

// DELETE: remove a special thread (admin only via the /api/admin proxy matcher)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!(await getSpecialEntry(slug))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await deleteSpecialThread(slug);
  return NextResponse.json({ ok: true });
}
