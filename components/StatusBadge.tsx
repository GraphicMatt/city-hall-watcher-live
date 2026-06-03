export type StatusType = 'ready' | 'connecting' | 'live' | 'error' | 'ended';

interface StatusBadgeProps {
  status: StatusType;
}

const config: Record<StatusType, { label: string; className: string; pulse: boolean }> = {
  ready:      { label: 'Ready',                        className: 'bg-[#f0f0ea] text-[#666] dark:bg-[#2a2a2a] dark:text-[#999]', pulse: false },
  connecting: { label: 'Connecting…',                  className: 'bg-[#f0f0ea] text-[#666] dark:bg-[#2a2a2a] dark:text-[#999]', pulse: true  },
  live:       { label: 'Live',                         className: 'bg-[#e6f4ea] text-[#2a7a3a] dark:bg-[#1a3a22] dark:text-[#4caf6a]', pulse: true },
  error:      { label: 'Connection error — retrying',  className: 'bg-[#fdecea] text-[#c0392b] dark:bg-[#3a1a1a] dark:text-[#f08080]', pulse: false },
  ended:      { label: 'Coverage ended',               className: 'bg-[#fff8e6] text-[#8a6000] dark:bg-[#2a2000] dark:text-[#f0b840]', pulse: false },
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const { label, className, pulse } = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${className}`}>
      <span className={`w-[7px] h-[7px] rounded-full bg-current flex-shrink-0 ${pulse ? 'animate-pulse' : ''}`} />
      {label}
    </span>
  );
}
