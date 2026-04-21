import { NextResponse } from 'next/server';
import { getArchiveIndex } from '@/lib/kv';

// GET: public — return the full archive index
export async function GET() {
  const index = await getArchiveIndex();
  return NextResponse.json(index);
}
