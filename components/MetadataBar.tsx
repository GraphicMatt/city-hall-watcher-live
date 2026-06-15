import type { SessionMetadata } from '@/lib/bluesky';

interface MetadataBarProps {
  metadata: SessionMetadata;
}

export default function MetadataBar({ metadata }: MetadataBarProps) {
  const { meetingTitle, agendaUrl, minutesUrl, previewUrl, videoSegments } = metadata;
  const hasLinks = agendaUrl || minutesUrl || previewUrl || (videoSegments && videoSegments.length > 0);
  if (!meetingTitle && !hasLinks) return null;

  return (
    <div className="border-b border-border bg-bg-secondary px-5 py-3">
      <div className="max-w-[640px] mx-auto flex items-center justify-between gap-4 flex-wrap">
        {meetingTitle && (
          <p
            className="text-sm font-semibold text-chw-text shrink-0"
            style={{ fontFamily: 'var(--font-schibsted)' }}
          >
            {meetingTitle}
          </p>
        )}
        {hasLinks && (
          <div className="flex items-center gap-4 flex-wrap">
            {agendaUrl && (
              <a
                href={agendaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-chw-secondary hover:text-chw-text hover:underline transition-colors"
              >
                Agenda
              </a>
            )}
            {minutesUrl && (
              <a
                href={minutesUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-chw-secondary hover:text-chw-text hover:underline transition-colors"
              >
                Minutes
              </a>
            )}
            {previewUrl && (
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-chw-secondary hover:text-chw-text hover:underline transition-colors"
              >
                Preview
              </a>
            )}
            {videoSegments?.map(seg => (
              <a
                key={seg.id}
                href={seg.youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-chw-secondary hover:text-chw-text hover:underline transition-colors"
              >
                ▶ {seg.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
