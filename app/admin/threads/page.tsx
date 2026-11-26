'use client';

import { useEffect, useState } from 'react';
import type { ArchiveEntry } from '@/lib/kv';
import AdminShell from '@/components/AdminShell';
import AdminPastSessions from '@/components/AdminPastSessions';
import AdminSpecialThreads from '@/components/AdminSpecialThreads';

export default function AdminThreadsPage() {
  return (
    <AdminShell>
      <AdminThreads />
    </AdminShell>
  );
}

function AdminThreads() {
  const [archiveIndex, setArchiveIndex] = useState<ArchiveEntry[] | null>(null);

  useEffect(() => {
    fetch('/api/archive')
      .then(r => (r.ok ? r.json() : []))
      .then(setArchiveIndex)
      .catch(() => setArchiveIndex([]));
  }, []);

  return (
    <>
      {archiveIndex === null ? (
        <p className="text-sm text-[#999] dark:text-[#555]">Loading threads…</p>
      ) : archiveIndex.length === 0 ? (
        <p className="text-sm text-[#999] dark:text-[#555]">No archived threads yet.</p>
      ) : (
        <AdminPastSessions
          entries={archiveIndex}
          onMetaSaved={(slug, updated) =>
            setArchiveIndex(idx => idx && idx.map(e => (e.slug === slug ? { ...e, metadata: updated } : e)))
          }
          onDelete={slug => setArchiveIndex(idx => idx && idx.filter(e => e.slug !== slug))}
        />
      )}

      {/* Special (non-council) threads */}
      <AdminSpecialThreads />
    </>
  );
}
