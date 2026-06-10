import { getArchiveIndex } from '@/lib/kv';
import ArchiveIndexClient from './ArchiveIndexClient';
import SiteHeader from '@/components/SiteHeader';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Past Coverage — CHW Live',
  description: 'Archive of past Toronto City Council live coverage threads by Matt Elliott.',
};

export default async function ArchiveIndexPage() {
  const index = await getArchiveIndex();

  return (
    <>
      <SiteHeader />

      <main className="max-w-[860px] mx-auto px-4 py-8 pb-12">
        <h1
          className="text-chw-text mb-8"
          style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px' }}
        >
          Past Coverage
        </h1>
        {index.length === 0 ? (
          <p className="text-sm text-chw-tertiary text-center py-12">
            No archived sessions yet.
          </p>
        ) : (
          <ArchiveIndexClient entries={index} />
        )}
      </main>
    </>
  );
}
