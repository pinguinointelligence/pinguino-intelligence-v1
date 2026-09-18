/**
 * DESIGN V3.0 HOME (XI + VIII) — „Słodycz” as its own layer.
 *
 * The same frame as PRO's „Dostosuj recepturę” (`pro-legend-box`: the legend in the
 * line, the axis name, a rail with its step names) with HOME's three positions
 * −1 · Optymalne · +1 and HOME's black handle. It writes through the SAME door the old
 * segmented pills used (`onChoose` → the page's `onSweetness`), so §61/§62 hold exactly:
 * the value is the existing Direction sweetness −1 / 0 / +1, and a PRO ±2 is only ever
 * overwritten when the customer taps a DIFFERENT position — tapping the one already
 * shown writes nothing (`tapChangesStoredValue`).
 */
import type { KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';
import { homeCreatorCopy } from '../homeCreatorCopy';
import {
  HOME_SWEETNESS_ORDER,
  projectSweetnessForDisplay,
  type HomeSweetness,
} from '../homeSweetness';
import { HomeLayer, HomeLayerFoot, HomeLayerHeading, homeLayerPrimaryButton } from './HomeLayer';
import { HOME_SWEETNESS_STEP } from './homeSweetnessSteps';

const copy = homeCreatorCopy.recipeScreen;

const SWEETNESS_WORDS: Readonly<Record<HomeSweetness, string>> = {
  less: homeCreatorCopy.sweetness.less,
  balanced: homeCreatorCopy.sweetness.balanced,
  sweeter: homeCreatorCopy.sweetness.sweeter,
};

/** `left:` of a position on the three-position rail. */
const leftOf = (index: number) => `${(index / (HOME_SWEETNESS_ORDER.length - 1)) * 100}%`;

export function HomeSweetnessSheet({
  stored,
  onChoose,
  onClose,
}: {
  /** The recipe's stored Direction sweetness (−2…+2); shown on HOME's three positions. */
  stored: number;
  /** The page's existing sweetness setter (`onSweetness`). */
  onChoose: (choice: HomeSweetness) => void;
  onClose: () => void;
}) {
  const active = projectSweetnessForDisplay(stored as -2 | -1 | 0 | 1 | 2);
  const activeIndex = HOME_SWEETNESS_ORDER.indexOf(active);
  const label = homeCreatorCopy.sweetness.label;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const move = (next: number) => {
      event.preventDefault();
      const target = HOME_SWEETNESS_ORDER[Math.max(0, Math.min(2, next))];
      if (target) onChoose(target);
    };
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') move(activeIndex - 1);
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') move(activeIndex + 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(2);
  };

  return (
    <HomeLayer label={label} testId="home-sweetness-sheet" onClose={onClose}>
      <div className="flex min-h-0 flex-col" data-testid="home-sweetness">
        <HomeLayerHeading title={label} subtitle={copy.sweetnessDefault} />
        <div className="min-h-0 overflow-y-auto pt-2">
          <section
            className="pro-legend-box mt-4 px-[18px] pt-7 pb-5"
            data-testid="home-sweetness-frame"
          >
            <h3
              data-band-legend
              className="text-[10px] leading-[14px] font-semibold tracking-[0.16em] text-[var(--g-text-muted)] uppercase"
            >
              {copy.sweetnessFrame}
            </h3>
            <div className="grid grid-cols-[minmax(64px,max-content)_minmax(0,1fr)] items-center gap-x-5">
              <b className="text-[15px] leading-[21px] font-semibold text-[var(--g-ink)]">
                {label}
              </b>
              <div className="min-w-0 px-[13px]">
                <div
                  role="radiogroup"
                  aria-label={label}
                  onKeyDown={onKeyDown}
                  className="relative h-[26px]"
                >
                  <span
                    aria-hidden
                    className="absolute inset-x-0 top-[12px] h-[2px] rounded-full bg-[#e4e0d9]"
                  />
                  {HOME_SWEETNESS_ORDER.map((choice, index) => (
                    <span
                      key={`dot-${choice}`}
                      aria-hidden
                      style={{ left: leftOf(index) }}
                      className="absolute top-[9.5px] -ml-[3.5px] size-[7px] rounded-full bg-[#d9d5ce]"
                    />
                  ))}
                  <span
                    aria-hidden
                    data-testid="home-sweetness-handle"
                    style={{ left: leftOf(activeIndex) }}
                    className="absolute top-[4px] -ml-[9px] size-[18px] rounded-full bg-[var(--g-ink)] shadow-[0_0_0_3px_#fff] transition-[left]"
                  />
                  {HOME_SWEETNESS_ORDER.map((choice, index) => (
                    <button
                      key={choice}
                      type="button"
                      role="radio"
                      aria-checked={choice === active}
                      aria-label={`${label}: ${SWEETNESS_WORDS[choice]}`}
                      data-testid={`home-sweetness-${choice}`}
                      tabIndex={choice === active ? 0 : -1}
                      onClick={() => onChoose(choice)}
                      style={{ left: leftOf(index) }}
                      className="pro-focus-ring absolute top-0 -ml-[22px] h-[26px] w-[44px] rounded-full bg-transparent after:absolute after:inset-x-0 after:-inset-y-[9px] after:content-['']"
                    />
                  ))}
                </div>
                <div
                  aria-hidden
                  className="relative mt-[7px] h-[14px] text-[11px] leading-[14px] text-[var(--g-text-muted)]"
                >
                  {HOME_SWEETNESS_ORDER.map((choice, index) => (
                    <span
                      key={choice}
                      style={{ left: leftOf(index) }}
                      className={cn(
                        'absolute -translate-x-1/2 whitespace-nowrap',
                        choice === active && 'font-semibold text-[var(--g-ink)]',
                      )}
                    >
                      {HOME_SWEETNESS_STEP[choice]}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
        <HomeLayerFoot>
          <button
            type="button"
            className={homeLayerPrimaryButton}
            data-testid="home-sweetness-done"
            onClick={onClose}
          >
            {copy.sweetnessDone}
          </button>
        </HomeLayerFoot>
      </div>
    </HomeLayer>
  );
}
