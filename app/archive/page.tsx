import { getArchiveIndex } from '@/lib/kv';
import ArchiveIndexClient from './ArchiveIndexClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Past Coverage — CHW Live',
  description: 'Archive of past Toronto City Council live coverage threads by Matt Elliott.',
};

export default async function ArchiveIndexPage() {
  const index = await getArchiveIndex();

  return (
    <>
      <header className="bg-white dark:bg-[#1a1a1a] border-b border-[#e0e0d8] dark:border-[#2a2a2a] px-6 py-3.5 flex items-center justify-between sticky top-0 z-10">
        <h1 className="text-sm font-semibold tracking-tight text-[#1a1a1a] dark:text-[#e8e8e0]">
          CHW Live <span className="text-[#888] font-normal">/ Past coverage</span>
        </h1>
        <div className="flex items-center gap-4">
          <a
            href="/search"
            className="text-xs text-[#888] hover:text-[#333] dark:hover:text-[#ccc] underline"
          >
            Search
          </a>
          <a
            href="/"
            className="text-xs text-[#888] hover:text-[#333] dark:hover:text-[#ccc] underline"
          >
            ← Live
          </a>
        </div>
      </header>

      <main className="max-w-[860px] mx-auto px-4 py-8 pb-12">
        {index.length === 0 ? (
          <p className="text-sm text-[#999] dark:text-[#555] text-center py-12">
            No archived sessions yet.
          </p>
        ) : (
          <ArchiveIndexClient entries={index} />
        )}
      </main>
    </>
  );
}
