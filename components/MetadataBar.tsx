import type { SessionMetadata } from '@/lib/bluesky';

interface MetadataBarProps {
  metadata: SessionMetadata;
}

export default function MetadataBar({ metadata }: MetadataBarProps) {
  const { meetingTitle, agendaUrl, previewUrl, videoSegments } = metadata;
  const hasLinks = agendaUrl || previewUrl || (videoSegments && videoSegments.length > 0);
  if (!meetingTitle && !hasLinks) return null;

  return (
    <div className="bg-[#fafaf8] dark:bg-[#141414] border-b border-[#e0e0d8] dark:border-[#2a2a2a] px-6 py-2.5">
      <div className="max-w-[640px] mx-auto flex items-center justify-between gap-4 flex-wrap">
        {meetingTitle && (
          <p className="text-xs font-medium text-[#555] dark:text-[#888] shrink-0">{meetingTitle}</p>
        )}
        {hasLinks && (
          <div className="flex items-center gap-4 flex-wrap">
            {agendaUrl && (
              <a
                href={agendaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#888] dark:text-[#555] hover:text-[#333] dark:hover:text-[#aaa] hover:underline transition-colors"
              >
                📋 Agenda
              </a>
            )}
            {previewUrl && (
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#888] dark:text-[#555] hover:text-[#333] dark:hover:text-[#aaa] hover:underline transition-colors"
              >
                📰 Preview
              </a>
            )}
            {videoSegments?.map(seg => (
              <a
                key={seg.id}
                href={seg.youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#888] dark:text-[#555] hover:text-[#333] dark:hover:text-[#aaa] hover:underline transition-colors"
              >
                📺 {seg.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
