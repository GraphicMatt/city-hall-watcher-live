import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { deleteArchiveEntry, getArchiveIndex, getArchivePosts, updateArchiveEntry } from '@/lib/kv';

// GET: archive entry metadata + posts (public)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const index = await getArchiveIndex();
  const entry = index.find(e => e.slug === slug);
  if (!entry) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const posts = await getArchivePosts(slug);
  return NextResponse.json({ entry, posts: posts ?? [] });
}

// PATCH: update archive entry metadata (admin only, protected by proxy)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const { metadata } = await request.json();
  await updateArchiveEntry(slug, { metadata });
  return NextResponse.json({ ok: true });
}

// DELETE: remove an archived session (admin only, protected by proxy)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const index = await getArchiveIndex();
  const exists = index.some(e => e.slug === slug);
  if (!exists) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await deleteArchiveEntry(slug);
  return NextResponse.json({ ok: true });
}
