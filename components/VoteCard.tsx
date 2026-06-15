import type { VoteCard as VoteCardData } from '@/lib/bluesky';
import { formatTime } from '@/lib/bluesky';
import { lastName } from '@/lib/councillors';
import { deriveMotionLabel } from '@/lib/voteMatching';

interface VoteCardProps {
  card: VoteCardData;
}

function StarIcon() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor" aria-hidden="true">
      <path d="M8 0.5l2.06 4.18 4.61.67-3.34 3.25.79 4.6L8 11.02l-4.12 2.18.79-4.6L1.33 5.35l4.61-.67L8 0.5z" />
    </svg>
  );
}

// Matches the "(Interest Declared)" suffix the Minutes append to a
// councillor's name in the Absent list when they recused themselves rather
// than simply being away.
const INTEREST_DECLARED_RE = /\(interest declared\)/i;

function Pill({ name, type, isMayor }: { name: string; type: 'yes' | 'no' | 'absent'; isMayor: boolean }) {
  const short = lastName(name);
  const interestDeclared = type === 'absent' && INTEREST_DECLARED_RE.test(name);
  const colorClasses =
    type === 'yes' ? 'bg-vote-yes-pill text-vote-yes-pill-text'
    : type === 'no' ? 'bg-vote-no-pill text-vote-no-pill-text'
    : 'bg-vote-absent text-chw-secondary';
  const borderColor =
    type === 'yes' ? 'border-vote-yes' : type === 'no' ? 'border-vote-no' : 'border-chw-tertiary';

  return (
    <span
      className={`inline-flex items-center gap-1 text-[13px] rounded px-2 py-1 border ${colorClasses} ${
        isMayor ? `${borderColor} font-medium` : interestDeclared ? 'border-chw-tertiary border-dashed' : 'border-transparent'
      } ${interestDeclared ? 'italic' : ''}`}
      title={interestDeclared ? 'Declared a conflict of interest' : undefined}
    >
      {isMayor && <StarIcon />}
      {short}
      {interestDeclared && <sup className="not-italic">†</sup>}
    </span>
  );
}

// Renders an official-Minutes-sourced vote result: a proportional yes/no/absent
// bar with a majority-threshold marker, plus councillor pills grouped by vote.
// Replaces the low-res screenshots previously used for vote announcements.
export default function VoteCard({ card }: VoteCardProps) {
  const { vote } = card;
  const yes = vote.yesCount;
  const no = vote.noCount;
  const absent = vote.absentCount;
  const totalVoting = yes + no;
  const totalAll = yes + no + absent;

  const threshold = vote.threshold.toLowerCase();
  const isTwoThirds = threshold.includes('two-thirds');
  const majorityN = isTwoThirds
    ? Math.floor((totalVoting * 2) / 3) + 1
    : Math.floor(totalVoting / 2) + 1;
  const thresholdLabel = isTwoThirds ? 'two-thirds' : 'majority';

  const yesPct = totalAll ? (yes / totalAll) * 100 : 0;
  const noPct = totalAll ? (no / totalAll) * 100 : 0;
  const absentPct = totalAll ? (absent / totalAll) * 100 : 0;
  const majorityPct = totalAll ? (majorityN / totalAll) * 100 : 50;

  const title = card.title || vote.itemTitle || vote.motionLabel || vote.voteLabel;
  const motionDescriptor = vote.motionLabel || deriveMotionLabel(vote.threshold);
  const mayorLast = (card.mayorLastName || 'Chow').toLowerCase();
  const carried = vote.result === 'Carried';

  return (
    <div className="mt-3 rounded-lg border border-border bg-bg-secondary px-4 py-3.5">
      <div className="flex items-baseline gap-3 mb-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-chw-tertiary">Council vote</span>
        {vote.timestamp && (
          <span className="text-[11px] text-chw-tertiary">{formatTime(vote.timestamp)}</span>
        )}
        {isTwoThirds && (
          <span className="ml-auto text-[11px] font-medium uppercase tracking-wide text-chw-tertiary">
            Two-thirds required
          </span>
        )}
        {vote.itemNumber && (
          <span className={`text-[11px] font-mono bg-card border border-card-border rounded px-1.5 py-0.5 text-chw-secondary ${isTwoThirds ? '' : 'ml-auto'}`}>
            {vote.itemNumber}
          </span>
        )}
      </div>

      <p className="text-[15px] font-medium text-chw-text mb-1">{title}</p>
      {motionDescriptor && (
        <p className="text-[12px] text-chw-tertiary mb-3.5">{motionDescriptor}</p>
      )}

      <div className="relative pt-4 mb-1.5">
        <span
          className="absolute top-0 text-[10px] text-chw-tertiary whitespace-nowrap -translate-x-1/2"
          style={{ left: `${majorityPct}%` }}
        >
          {thresholdLabel} ({majorityN})
        </span>
        <div
          className="absolute w-[2px] bg-card opacity-90 z-10"
          style={{ left: `${majorityPct}%`, top: '16px', height: '28px' }}
        />
        <div className="flex h-7 rounded overflow-hidden">
          {yes > 0 && (
            <div
              className="flex items-center justify-end pr-2 bg-vote-yes"
              style={{ width: `${yesPct}%` }}
            >
              <span className="text-[13px] font-medium text-vote-yes-on">{yes}</span>
            </div>
          )}
          {no > 0 && (
            <div className="flex items-center pl-2 bg-vote-no" style={{ width: `${noPct}%` }}>
              <span className="text-[13px] font-medium text-vote-no-on">{no}</span>
            </div>
          )}
          {absent > 0 && (
            <div className="bg-vote-absent border-l border-card-border" style={{ width: `${absentPct}%` }} />
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 text-[12px] text-chw-secondary mt-3 mb-4">
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-middle bg-vote-yes" />Yes</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-middle bg-vote-no" />No</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-middle bg-vote-absent border border-card-border" />Absent</span>
        <span className={`ml-auto font-medium ${carried ? 'text-vote-carried' : 'text-vote-lost'}`}>
          Motion {vote.result.toLowerCase()}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-vote-carried mb-2">
            Voted yes ({yes})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {vote.yesNames.map(name => (
              <Pill key={name} name={name} type="yes" isMayor={lastName(name).toLowerCase() === mayorLast} />
            ))}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-vote-lost mb-2">
            Voted no ({no})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {vote.noNames.map(name => (
              <Pill key={name} name={name} type="no" isMayor={lastName(name).toLowerCase() === mayorLast} />
            ))}
          </div>
        </div>
      </div>

      {absent > 0 && (
        <div className="mt-3.5 flex flex-wrap gap-1.5 items-center">
          <span className="text-[12px] text-chw-tertiary mr-0.5">Absent:</span>
          {vote.absentNames.map(name => (
            <Pill key={name} name={name} type="absent" isMayor={lastName(name).toLowerCase() === mayorLast} />
          ))}
          {vote.absentNames.some(n => INTEREST_DECLARED_RE.test(n)) && (
            <span className="text-[11px] text-chw-tertiary">† declared a conflict of interest</span>
          )}
        </div>
      )}
    </div>
  );
}
