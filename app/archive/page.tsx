import { getArchiveIndex } from '@/lib/kv';

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
        <a
          href="/"
          className="text-xs text-[#888] hover:text-[#333] dark:hover:text-[#ccc] underline"
        >
          ← Live
        </a>
      </header>

      <main className="max-w-[640px] mx-auto px-4 py-8 pb-12">
        {index.length === 0 ? (
          <p className="text-sm text-[#999] dark:text-[#555] text-center py-12">
            No archived sessions yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {index.map(entry => (
              <a
                key={entry.slug}
                href={`/${entry.slug}`}
                className="bg-white dark:bg-[#1a1a1a] border border-[#e0e0d8] dark:border-[#2a2a2a] rounded-[10px] px-4 py-3.5 flex items-center justify-between gap-4 hover:border-[#bbb] dark:hover:border-[#444] transition-colors group"
              >
                <div>
                  <p className="text-sm font-medium text-[#1a1a1a] dark:text-[#e8e8e0] group-hover:text-[#1a6bbf] dark:group-hover:text-[#5a9fd4] transition-colors">
                    {entry.label}
                  </p>
                  <p className="text-xs text-[#aaa] dark:text-[#555] mt-0.5">
                    {entry.postCount} {entry.postCount === 1 ? 'post' : 'posts'}
                  </p>
                </div>
                <span className="text-[#ccc] dark:text-[#444] text-sm flex-shrink-0">→</span>
              </a>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
