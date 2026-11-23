'use client';

import { useEffect, useState } from 'react';
import type { SpecialEntry } from '@/lib/kv';

// Admin panel for special (non-council) threads. These live under their own
// KV keys and are only reachable at /special/<slug> — never listed publicly.

const inputClass =
  'text-xs px-2 py-1.5 border border-[#d0d0c8] dark:border-[#333] rounded bg-[#fafaf8] dark:bg-[#111] text-[#1a1a1a] dark:text-[#e8e8e0] outline-none focus:border-[#888] w-full';
const primaryBtn =
  'text-xs font-medium px-3 py-1 rounded-lg bg-[#1a1a1a] dark:bg-[#e8e8e0] text-white dark:text-[#111] hover:bg-[#333] disabled:opacity-50';
const secondaryBtn =
  'text-xs px-2.5 py-1 rounded border border-[#e0e0d8] dark:border-[#2a2a2a] text-[#666] dark:text-[#aaa] hover:bg-[#f5f5f0] dark:hover:bg-[#222] disabled:opacity-50';

export default function AdminSpecialThreads() {
  const [open, setOpen] = useState(false);
  const [specials, setSpecials] = useState<SpecialEntry[]>([]);
  const [rootUrl, setRootUrl] = useState('');
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState<string | null>(null); // 'import' or a slug
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch('/api/admin/special')
      .then(r => r.json())
      .then(d => setSpecials(d.specials ?? []))
      .catch(() => setError('Could not load special threads.'));
  }, [open]);

  async function save(body: { rootUrl: string; slug: string; title: string; description?: string }, key: string) {
    setBusy(key);
    setError(null);
    try {
      const r = await fetch('/api/admin/special', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error || 'Import failed.');
        return false;
      }
      const list = await fetch('/api/admin/special').then(res => res.json());
      setSpecials(list.specials ?? []);
      return true;
    } catch {
      setError('Import failed.');
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    const exists = specials.some(s => s.slug === slug.trim().toLowerCase());
    if (exists && !confirm(`/special/${slug} already exists. Replace it?`)) return;
    const ok = await save({ rootUrl, slug, title, description }, 'import');
    if (ok) {
      setRootUrl('');
      setSlug('');
      setTitle('');
      setDescription('');
    }
  }

  async function handleDelete(s: SpecialEntry) {
    if (!confirm(`Delete /special/${s.slug}? This removes the archived posts.`)) return;
    setBusy(s.slug);
    setError(null);
    const r = await fetch(`/api/admin/special/${s.slug}`, { method: 'DELETE' });
    setBusy(null);
    if (!r.ok) {
      setError('Delete failed.');
      return;
    }
    setSpecials(list => list.filter(x => x.slug !== s.slug));
  }

  return (
    <div className="bg-white dark:bg-[#1a1a1a] border border-[#e0e0d8] dark:border-[#2a2a2a] rounded-xl p-5">
      <button onClick={() => setOpen(v => !v)} className="w-full text-left flex items-center justify-between">
        <p className="text-xs font-medium text-[#888] uppercase tracking-wide">Special Threads</p>
        <span className="text-xs text-[#aaa]">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-4 flex flex-col gap-4">
          <p className="text-xs text-[#888] dark:text-[#555]">
            Non-council threads. Not listed on the home page, archive or search — only reachable at /special/&lt;slug&gt;.
          </p>

          <form onSubmit={handleImport} className="flex flex-col gap-2">
            <input className={inputClass} placeholder="Bluesky URL of the first post" value={rootUrl} onChange={e => setRootUrl(e.target.value)} required />
            <div className="flex items-center gap-1">
              <span className="text-xs text-[#888] flex-shrink-0">/special/</span>
              <input className={inputClass} placeholder="councillor-history" value={slug} onChange={e => setSlug(e.target.value)} pattern="[a-z0-9]+(-[a-z0-9]+)*" required />
            </div>
            <input className={inputClass} placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} required />
            <textarea className={inputClass} placeholder="Description (optional; shown under the title and in share previews)" rows={2} value={description} onChange={e => setDescription(e.target.value)} />
            <div>
              <button type="submit" disabled={busy !== null} className={primaryBtn}>
                {busy === 'import' ? 'Importing…' : 'Import thread'}
              </button>
            </div>
          </form>

          {error && <p className="text-xs text-[#c0392b] dark:text-[#f08080]">⚠ {error}</p>}

          {specials.length > 0 && (
            <div className="flex flex-col gap-2">
              {specials.map(s => (
                <div key={s.slug} className="border border-[#f0f0ea] dark:border-[#222] rounded-lg p-3 flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <a href={`/special/${s.slug}`} className="text-xs font-medium text-[#1a6bbf] dark:text-[#5a9fd4] hover:underline break-words">
                      {s.title}
                    </a>
                    <p className="text-xs text-[#aaa] dark:text-[#555]">
                      /special/{s.slug} · {s.postCount} posts · refreshed {new Date(s.importedAt).toLocaleDateString('en-CA')}
                    </p>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => save({ rootUrl: s.rootUrl, slug: s.slug, title: s.title, description: s.description }, s.slug)}
                      disabled={busy !== null}
                      className={secondaryBtn}
                    >
                      {busy === s.slug ? '…' : 'Refresh'}
                    </button>
                    <button onClick={() => handleDelete(s)} disabled={busy !== null} className={`${secondaryBtn} text-[#c0392b] dark:text-[#f08080]`}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
