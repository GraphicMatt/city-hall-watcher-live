'use client';

import { useState } from 'react';
import type { SessionMetadata, VideoSegment } from '@/lib/bluesky';

interface MetadataEditorProps {
  slug?: string;             // undefined = active session, string = archive slug
  initialMetadata?: SessionMetadata;
  onSaved?: (metadata: SessionMetadata) => void;
}

function isoToDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datetimeLocalToIso(local: string): string {
  return new Date(local).toISOString();
}

function genId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export default function MetadataEditor({ slug, initialMetadata, onSaved }: MetadataEditorProps) {
  const [meetingTitle, setMeetingTitle] = useState(initialMetadata?.meetingTitle ?? '');
  const [agendaUrl, setAgendaUrl] = useState(initialMetadata?.agendaUrl ?? '');
  const [minutesUrl, setMinutesUrl] = useState(initialMetadata?.minutesUrl ?? '');
  const [previewUrl, setPreviewUrl] = useState(initialMetadata?.previewUrl ?? '');
  const [segments, setSegments] = useState<VideoSegment[]>(initialMetadata?.videoSegments ?? []);
  const [suggestions, setSuggestions] = useState<VideoSegment[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // New segment form state
  const [newUrl, setNewUrl] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newStartTime, setNewStartTime] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  async function handleDetect() {
    setDetecting(true);
    setSuggestions([]);
    try {
      const url = slug ? `/api/archive/${slug}/detect` : '/api/session/detect';
      const r = await fetch(url, { method: 'POST' });
      const data = await r.json();
      const found: VideoSegment[] = data.segments ?? [];
      // Only show segments not already in the confirmed list
      setSuggestions(found.filter(s => !segments.some(c => c.youtubeUrl === s.youtubeUrl)));
    } catch {
      // silent — user can try again
    } finally {
      setDetecting(false);
    }
  }

  function addSuggestion(seg: VideoSegment) {
    setSegments(prev => [...prev, { ...seg, id: genId() }]);
    setSuggestions(prev => prev.filter(s => s.youtubeUrl !== seg.youtubeUrl));
  }

  function addManual() {
    if (!newUrl.trim()) return;
    setSegments(prev => [
      ...prev,
      {
        id: genId(),
        youtubeUrl: newUrl.trim(),
        label: newLabel.trim() || `Day ${prev.length + 1}`,
        startTime: newStartTime ? datetimeLocalToIso(newStartTime) : new Date().toISOString(),
      },
    ]);
    setNewUrl('');
    setNewLabel('');
    setNewStartTime('');
    setShowAddForm(false);
  }

  function updateSegment(id: string, patch: Partial<VideoSegment>) {
    setSegments(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)));
  }

  function removeSegment(id: string) {
    setSegments(prev => prev.filter(s => s.id !== id));
  }

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    const metadata: SessionMetadata = {
      meetingTitle: meetingTitle.trim() || undefined,
      agendaUrl: agendaUrl.trim() || undefined,
      minutesUrl: minutesUrl.trim() || undefined,
      previewUrl: previewUrl.trim() || undefined,
      videoSegments: segments.length ? segments : undefined,
    };
    const url = slug ? `/api/archive/${slug}` : '/api/session';
    const r = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metadata }),
    });
    setSaving(false);
    if (!r.ok) {
      setSaveError('Save failed — try again.');
    } else {
      onSaved?.(metadata);
    }
  }

  const inputCls = 'text-sm px-3 py-2 border border-[#d0d0c8] dark:border-[#333] rounded-lg bg-[#fafaf8] dark:bg-[#111] text-[#1a1a1a] dark:text-[#e8e8e0] placeholder-[#aaa] outline-none focus:border-[#888] dark:focus:border-[#666] transition-colors w-full';
  const labelCls = 'text-xs text-[#666] dark:text-[#777] mb-1 block';

  return (
    <div className="flex flex-col gap-4 pt-1">

      {/* Basic metadata */}
      <div className="flex flex-col gap-3">
        <div>
          <label className={labelCls}>Meeting title</label>
          <input className={inputCls} value={meetingTitle} onChange={e => setMeetingTitle(e.target.value)} placeholder="e.g. City Council — April 2026" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Agenda URL</label>
            <input className={inputCls} value={agendaUrl} onChange={e => setAgendaUrl(e.target.value)} placeholder="toronto.ca/council/…" />
          </div>
          <div>
            <label className={labelCls}>Minutes URL</label>
            <input className={inputCls} value={minutesUrl} onChange={e => setMinutesUrl(e.target.value)} placeholder="toronto.ca/council/…" />
          </div>
          <div>
            <label className={labelCls}>Preview URL</label>
            <input className={inputCls} value={previewUrl} onChange={e => setPreviewUrl(e.target.value)} placeholder="Substack preview link" />
          </div>
        </div>
      </div>

      {/* Video segments */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className={labelCls + ' mb-0'}>YouTube videos</label>
          <button
            onClick={handleDetect}
            disabled={detecting}
            className="text-xs text-[#888] hover:text-[#333] dark:hover:text-[#ccc] underline disabled:opacity-50"
          >
            {detecting ? 'Detecting…' : 'Detect from thread'}
          </button>
        </div>

        {/* Confirmed segments */}
        {segments.length > 0 && (
          <div className="flex flex-col gap-2 mb-2">
            {segments.map(seg => (
              <div key={seg.id} className="flex items-start gap-2 p-2.5 bg-[#f5f5f0] dark:bg-[#111] rounded-lg border border-[#e0e0d8] dark:border-[#2a2a2a]">
                <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                  <div className="flex gap-2">
                    <input
                      value={seg.label}
                      onChange={e => updateSegment(seg.id, { label: e.target.value })}
                      placeholder="Label"
                      className="text-xs px-2 py-1 border border-[#d0d0c8] dark:border-[#333] rounded bg-white dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-[#e8e8e0] outline-none focus:border-[#888] w-36 shrink-0"
                    />
                    <input
                      type="datetime-local"
                      value={isoToDatetimeLocal(seg.startTime)}
                      onChange={e => updateSegment(seg.id, { startTime: datetimeLocalToIso(e.target.value) })}
                      className="text-xs px-2 py-1 border border-[#d0d0c8] dark:border-[#333] rounded bg-white dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-[#e8e8e0] outline-none focus:border-[#888] flex-1 min-w-0"
                    />
                  </div>
                  <input
                    value={seg.youtubeUrl}
                    onChange={e => updateSegment(seg.id, { youtubeUrl: e.target.value })}
                    placeholder="YouTube URL"
                    className="text-xs px-2 py-1 border border-[#d0d0c8] dark:border-[#333] rounded bg-white dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-[#e8e8e0] outline-none focus:border-[#888] w-full font-mono"
                  />
                </div>
                <button
                  onClick={() => removeSegment(seg.id)}
                  className="text-[#ccc] hover:text-[#c0392b] dark:hover:text-[#f08080] text-sm leading-none mt-1 shrink-0 transition-colors"
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Detected suggestions */}
        {suggestions.length > 0 && (
          <div className="flex flex-col gap-1.5 mb-2">
            <p className="text-xs text-[#888] dark:text-[#555]">Detected — click to add:</p>
            {suggestions.map(seg => (
              <div key={seg.youtubeUrl} className="flex items-center gap-2 p-2 bg-[#eef5fd] dark:bg-[#0d1f35] rounded-lg border border-[#cce0f5] dark:border-[#1a3a5c] text-xs">
                <span className="font-medium text-[#1a1a1a] dark:text-[#e8e8e0] shrink-0">{seg.label}</span>
                <span className="text-[#888] shrink-0">{new Date(seg.startTime).toLocaleString('en-CA', { dateStyle: 'short', timeStyle: 'short' })}</span>
                <span className="text-[#aaa] truncate flex-1 font-mono">{seg.youtubeUrl}</span>
                <button
                  onClick={() => addSuggestion(seg)}
                  className="text-[#1a6bbf] dark:text-[#5a9fd4] hover:underline shrink-0 font-medium"
                >
                  + Add
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add manually */}
        {showAddForm ? (
          <div className="flex flex-col gap-2 p-2.5 bg-[#f5f5f0] dark:bg-[#111] rounded-lg border border-[#e0e0d8] dark:border-[#2a2a2a]">
            <div className="flex gap-2">
              <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Label (e.g. Day 1)" className="text-xs px-2 py-1 border border-[#d0d0c8] dark:border-[#333] rounded bg-white dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-[#e8e8e0] outline-none focus:border-[#888] w-36 shrink-0" />
              <input type="datetime-local" value={newStartTime} onChange={e => setNewStartTime(e.target.value)} className="text-xs px-2 py-1 border border-[#d0d0c8] dark:border-[#333] rounded bg-white dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-[#e8e8e0] outline-none focus:border-[#888] flex-1" />
            </div>
            <input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="YouTube URL" className="text-xs px-2 py-1 border border-[#d0d0c8] dark:border-[#333] rounded bg-white dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-[#e8e8e0] outline-none focus:border-[#888] w-full font-mono" />
            <div className="flex gap-2">
              <button onClick={addManual} disabled={!newUrl.trim()} className="text-xs text-[#1a6bbf] dark:text-[#5a9fd4] hover:underline disabled:opacity-40">Add</button>
              <button onClick={() => setShowAddForm(false)} className="text-xs text-[#aaa] hover:text-[#555] dark:hover:text-[#ccc]">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAddForm(true)} className="text-xs text-[#888] hover:text-[#333] dark:hover:text-[#ccc] underline">
            + Add video manually
          </button>
        )}
      </div>

      {saveError && <p className="text-xs text-[#c0392b] dark:text-[#f08080]">⚠ {saveError}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="text-sm font-medium py-2 rounded-lg bg-[#1a1a1a] dark:bg-[#e8e8e0] text-white dark:text-[#111] hover:bg-[#333] dark:hover:bg-white transition-colors disabled:opacity-50 self-start px-5"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}
