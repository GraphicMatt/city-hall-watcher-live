import type { Metadata } from 'next';
import { getActiveSession } from '@/lib/kv';
import LivePoller from '@/components/LivePoller';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const session = await getActiveSession();
  const isLive = session?.status === 'live';
  return {
    title: isLive ? 'Live — CHW Live' : 'CHW Live — Toronto City Council',
    description: isLive
      ? 'Live coverage of a Toronto City Council meeting by Matt Elliott. Auto-updating.'
      : 'Live coverage of Toronto City Council meetings by Matt Elliott.',
    openGraph: {
      title: isLive ? 'CHW Live — Toronto City Council (Live)' : 'CHW Live — Toronto City Council',
      description: isLive
        ? 'Live coverage of a Toronto City Council meeting by Matt Elliott. Auto-updating.'
        : 'Live coverage of Toronto City Council meetings by Matt Elliott.',
      url: 'https://live.cityhallwatcher.com',
      siteName: 'CHW Live',
    },
  };
}

export default async function Home() {
  const session = await getActiveSession();

  if (!session || session.status === 'ended') {
    return (
      <>
        <header className="bg-white dark:bg-[#1a1a1a] border-b border-[#e0e0d8] dark:border-[#2a2a2a] px-6 py-3.5 flex items-center justify-between sticky top-0 z-10">
          <h1 className="text-sm font-semibold tracking-tight text-[#1a1a1a] dark:text-[#e8e8e0]">
            CHW Live <span className="text-[#888] font-normal">/ Toronto City Council</span>
          </h1>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-[#f0f0ea] text-[#666] dark:bg-[#2a2a2a] dark:text-[#999]">
            <span className="w-[7px] h-[7px] rounded-full bg-current" />
            No coverage
          </span>
        </header>
        <main className="max-w-[640px] mx-auto px-4 py-16 text-center">
          <p className="text-sm text-[#999] dark:text-[#555]">No live coverage right now.</p>
          <p className="text-xs text-[#bbb] dark:text-[#444] mt-2">Check back during a Toronto City Council meeting.</p>
          <a
            href="/archive"
            className="inline-block mt-6 text-xs text-[#1a6bbf] dark:text-[#5a9fd4] hover:underline"
          >
            View past coverage →
          </a>
        </main>
      </>
    );
  }

  return <LivePoller rootUri={session.rootUri} authorDid={session.authorDid} />;
}
