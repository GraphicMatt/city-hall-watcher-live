export type StatusType = 'ready' | 'connecting' | 'live' | 'error' | 'ended';

interface StatusBadgeProps {
  status: StatusType;
}

// Sizes/padding match the Figma export: height 25px, padding 5px 11px
const BASE =
  'inline-flex items-center gap-[7px] rounded-full flex-shrink-0';

const LABEL_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-plex)',
  fontSize: '12px',
  letterSpacing: '0.72px',
};

const config: Record<StatusType, {
  label: string;
  dotStyle: React.CSSProperties;
  badgeStyle: React.CSSProperties;
  fontWeight: number;
  pulse: boolean;
}> = {
  ready: {
    label: 'STANDBY',
    dotStyle: { background: 'rgba(255,255,255,0.65)', width: 6, height: 6, borderRadius: '50%', flexShrink: 0 },
    badgeStyle: { background: 'rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.85)', padding: '5px 11px' },
    fontWeight: 500,
    pulse: false,
  },
  connecting: {
    label: 'CONNECTING',
    dotStyle: { background: 'rgba(255,255,255,0.65)', width: 6, height: 6, borderRadius: '50%', flexShrink: 0 },
    badgeStyle: { background: 'rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.85)', padding: '5px 11px' },
    fontWeight: 500,
    pulse: true,
  },
  live: {
    label: 'LIVE',
    dotStyle: { background: 'rgb(255,255,255)', width: 6, height: 6, borderRadius: '50%', flexShrink: 0 },
    badgeStyle: { background: 'rgb(216,64,42)', color: 'rgb(255,255,255)', padding: '5px 11px' },
    fontWeight: 600,
    pulse: true,
  },
  error: {
    label: 'ERROR',
    dotStyle: { background: 'rgba(255,255,255,0.65)', width: 6, height: 6, borderRadius: '50%', flexShrink: 0 },
    badgeStyle: { background: 'rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.85)', padding: '5px 11px' },
    fontWeight: 500,
    pulse: false,
  },
  ended: {
    label: 'ENDED',
    dotStyle: { background: 'rgb(185,138,46)', width: 6, height: 6, borderRadius: '50%', flexShrink: 0 },
    badgeStyle: { background: 'rgba(185,138,46,0.2)', color: 'rgb(185,138,46)', padding: '5px 11px' },
    fontWeight: 500,
    pulse: false,
  },
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const { label, dotStyle, badgeStyle, fontWeight, pulse } = config[status];
  return (
    <span className={BASE} style={badgeStyle}>
      <span
        className={pulse ? 'animate-pulse' : ''}
        style={dotStyle}
      />
      <span style={{ ...LABEL_STYLE, fontWeight }}>
        {label}
      </span>
    </span>
  );
}
