import { notFound, redirect } from 'next/navigation';
import { getActiveSession, getArchiveIndex } from '@/lib/kv';
import { threadId } from '@/lib/push/store';
import LivePoller from '@/components/LivePoller';
import SiteHeader from '@/components/SiteHeader';
import PushNotifications from '@/components/PushNotifications';

export const dynamic = 'force-dynamic';

export default async function ThreadPage({ params, searchParams }: {
  params: Promise<{ threadId: string }>;
  searchParams: Promise<{ post?: string }>;
}) {
  const [{ threadId: id }, query, session, index] = await Promise.all([
    params, searchParams, getActiveSession(), getArchiveIndex(),
  ]);
  const post = typeof query.post === 'string' && /^[A-Za-z0-9]+$/.test(query.post) ? query.post : undefined;
  if (session?.status === 'live' && threadId(session.rootUri) === id) {
    return <LivePoller rootUri={session.rootUri} authorDid={session.authorDid} metadata={session.metadata} initialPostId={post} />;
  }
  const archived = index.filter(entry => entry.rootUri && threadId(entry.rootUri) === id)
    .sort((a, b) => b.endedAt.localeCompare(a.endedAt))[0];
  if (archived) redirect(`/${archived.slug}${post ? `#post-${post}` : ''}`);
  if (session && threadId(session.rootUri) === id) {
    return <>
      <SiteHeader />
      <main className="max-w-[640px] mx-auto px-4 py-6">
        <PushNotifications rootUri={session.rootUri} live={false} />
        <p>Coverage has ended. The archive will be available shortly.</p>
      </main>
    </>;
  }
  notFound();
}
