import { useId } from 'react';
import { SCANNER_STORY, type ScannerStoryStage } from './scannerStatusCopy';

interface GelatoMarkProps {
  level: number;
  animated: boolean;
}

function GelatoMark({ level, animated }: GelatoMarkProps) {
  const clipId = `scanner-gelato-${useId().replaceAll(':', '')}`;
  const fillOffset = 160 - level * 1.6;

  return (
    <div className="w-[64px] shrink-0 sm:w-[72px]" aria-hidden="true">
      <svg viewBox="0 0 120 160" className="block h-auto w-full overflow-visible">
        <defs>
          <clipPath id={clipId}>
            <path d="M29 72C18 65 19 49 30 40C31 25 43 14 57 15C68 4 87 9 92 25C106 28 112 45 104 57C101 67 93 72 82 72H29ZM34 72H86L69 145C67 153 55 157 51 147L34 72Z" />
          </clipPath>
        </defs>

        <g clipPath={`url(#${clipId})`}>
          <rect
            x="0"
            y="0"
            width="120"
            height="160"
            className={
              animated
                ? 'fill-stone-900 transition-transform duration-500 ease-out motion-reduce:transition-none'
                : 'fill-stone-900'
            }
            style={{ transform: `translateY(${fillOffset}px)` }}
          />
        </g>

        <path
          d="M29 72C18 65 19 49 30 40C31 25 43 14 57 15C68 4 87 9 92 25C106 28 112 45 104 57C101 67 93 72 82 72H29Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinejoin="round"
          className="text-stone-800"
        />
        <path
          d="M34 72H86L69 145C67 153 55 157 51 147L34 72Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinejoin="round"
          className="text-stone-800"
        />
        <path
          d="M42 89L76 119M39 106L71 134M78 87L47 119"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          className="text-stone-400"
        />
      </svg>
    </div>
  );
}

function StorySteps({ stage }: { stage: ScannerStoryStage }) {
  const current = SCANNER_STORY[stage];

  return (
    <div className="mt-3 flex gap-1.5" aria-hidden="true">
      {Object.values(SCANNER_STORY).map((step) => (
        <span
          key={step.level}
          className={`h-px flex-1 ${step.level <= current.level ? 'bg-stone-900' : 'bg-stone-200'}`}
        />
      ))}
    </div>
  );
}

export function ScannerStatusStory({ stage }: { stage: ScannerStoryStage }) {
  const story = SCANNER_STORY[stage];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="scanner-status-story"
      data-gelato-level={story.level}
      className="flex w-full min-w-0 items-center gap-4 rounded-lg border border-stone-200 bg-[#fbfaf7] p-4 text-ink sm:gap-5 sm:p-5"
    >
      <GelatoMark level={story.level} animated />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
          Gellatti składa wynik
        </p>
        <p className="mt-1.5 text-sm font-medium leading-6 sm:text-base">{story.message}</p>
        <StorySteps stage={stage} />
      </div>
    </div>
  );
}

interface ScannerMissingDataNoticeProps {
  stage: ScannerStoryStage;
  message: string;
}

export function ScannerMissingDataNotice({ stage, message }: ScannerMissingDataNoticeProps) {
  const story = SCANNER_STORY[stage];

  return (
    <div
      data-testid="scanner-missing-data"
      data-paused="true"
      data-gelato-level={story.level}
      className="flex w-full min-w-0 items-center gap-4 rounded-lg border border-stone-200 bg-[#fbfaf7] p-4 text-ink sm:gap-5 sm:p-5"
    >
      <GelatoMark level={story.level} animated={false} />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
          Potrzebujemy Twojej pomocy
        </p>
        <p className="mt-1.5 text-sm font-medium leading-6 sm:text-base">{message}</p>
        <StorySteps stage={stage} />
      </div>
    </div>
  );
}
