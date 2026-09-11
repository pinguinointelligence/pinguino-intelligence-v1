/**
 * §29 — the coachmark itself.
 *
 * A spotlight, not a slideshow: the rest of the screen dims, the element being
 * explained keeps its own pixels, and a small card sits beside it with one
 * short sentence, „Dalej", „Pomiń" and a step counter. The page scrolls the
 * element into view first, so the tutorial never talks about something below
 * the fold.
 *
 * The dimming is ONE element with a very large spread `box-shadow` cut to the
 * anchor's rectangle, rather than four rectangles around it: one box cannot
 * develop a seam, and it follows the anchor's own corner radius for free.
 *
 * Nothing here changes the application's data. The tutorial reads the DOM and
 * paints over it; it never clicks a control, opens a panel or edits a recipe
 * (§29G: „Nie zmieniaj realnych danych").
 */
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { availableSteps, HOME_TUTORIAL_STEPS, type TutorialStep } from './tutorialSteps';
import { readSeen, shouldAutoStart, useTutorialStore } from './tutorialState';

interface Rect {
  anchor: string;
  top: number;
  left: number;
  width: number;
  height: number;
  radius: string;
}

const PAD = 8;

function anchorRect(anchor: string): Rect | null {
  if (typeof document === 'undefined') return null;
  const el = document.querySelector<HTMLElement>(`[data-testid="${anchor}"]`);
  if (!el) return null;
  const box = el.getBoundingClientRect();
  if (box.width === 0 && box.height === 0) return null;
  return {
    anchor,
    top: box.top - PAD,
    left: box.left - PAD,
    width: box.width + PAD * 2,
    height: box.height + PAD * 2,
    radius: getComputedStyle(el).borderRadius || '12px',
  };
}

const present = (anchor: string): boolean =>
  typeof document !== 'undefined' && document.querySelector(`[data-testid="${anchor}"]`) !== null;

export function TutorialOverlay({
  steps = HOME_TUTORIAL_STEPS,
}: {
  steps?: readonly TutorialStep[];
}) {
  const run = useTutorialStore((state) => state.run);
  const start = useTutorialStore((state) => state.start);
  const next = useTutorialStore((state) => state.next);
  const back = useTutorialStore((state) => state.back);
  const skip = useTutorialStore((state) => state.skip);
  const [visible, setVisible] = useState<TutorialStep[]>([]);
  const [rect, setRect] = useState<Rect | null>(null);

  /* Which steps can honestly be shown depends on what is currently rendered, so
     it is recomputed whenever the run advances rather than once at mount. */
  const measure = useCallback(() => setVisible(availableSteps(steps, present)), [steps]);

  /* Measuring reads the DOM, so it happens after the browser has laid the page
     out — one frame later, never synchronously inside the effect. */
  useEffect(() => {
    const frame = window.requestAnimationFrame(measure);
    return () => window.cancelAnimationFrame(frame);
  }, [measure, run]);

  /* First run: offer it once, and only when there is something to point at.
     A short delay lets HOME finish its first paint — measuring an element that
     has not been laid out yet is how a spotlight lands on nothing. */
  useEffect(() => {
    if (run.status !== 'idle') return;
    const timer = window.setTimeout(() => {
      const candidates = availableSteps(steps, present);
      if (
        shouldAutoStart({
          seen: readSeen(),
          anchoredStepCount: candidates.filter((candidate) => !candidate.anchorOptional).length,
          alreadyRunning: useTutorialStore.getState().run.status === 'running',
        })
      ) {
        setVisible(candidates);
        start();
      }
    }, 400);
    return () => window.clearTimeout(timer);
    // Only ever considered while idle; a running tutorial must not restart itself.
  }, [run.status, start, steps]);

  const index = run.status === 'running' ? run.index : 0;
  const step = run.status === 'running' ? visible[index] : undefined;
  /* The measured box belongs to ONE step. Painting it for the next one would
     spotlight the previous element for a frame, so the rect is only used while
     it still describes the step on screen. */
  const spotlight = rect && rect.anchor === step?.anchor ? rect : null;

  /* Scroll the element into view, then measure it. Measuring first would place
     the spotlight where the element used to be. */
  useLayoutEffect(() => {
    /* No step means nothing is painted at all (the component returns null
       below), so a stale rectangle can never be read — there is nothing to
       clear, and clearing it here would be a synchronous render cascade. */
    if (!step) return;
    const el = document.querySelector<HTMLElement>(`[data-testid="${step.anchor}"]`);
    // Every browser we ship to has it; jsdom and some embedded webviews do
    // not. A tutorial must never be the thing that throws on a page.
    if (typeof el?.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    /* A smooth scroll is not finished when it starts, so the box is followed
       until it stops moving and only then do we stop paying for frames.
       "Has it stopped" is answered from a LOCAL record of the last measurement,
       never from inside the state updater: React may invoke an updater more
       than once per commit, which would double-count the settle and abandon the
       element mid-scroll. */
    let frame = 0;
    let timer = 0;
    let settled = 0;
    let stopped = false;
    let previous: Rect | null = null;

    /* rAF is the right clock while the tab is visible. A HIDDEN tab throttles it
       or stops it altogether, and a tutorial that never measured shows a dimmed
       screen with no lit element the moment the customer comes back — so a timer
       runs beside it and whichever arrives first cancels the other. Measured,
       never guessed. */
    const schedule = () => {
      frame = window.requestAnimationFrame(tick);
      timer = window.setTimeout(tick, 32);
    };

    function tick() {
      if (stopped) return;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      const nextRect = anchorRect(step!.anchor);
      const same =
        previous !== null &&
        nextRect !== null &&
        Math.abs(previous.top - nextRect.top) < 0.5 &&
        Math.abs(previous.left - nextRect.left) < 0.5;
      settled = same ? settled + 1 : 0;
      previous = nextRect;
      setRect(nextRect);
      if (settled < 6) schedule();
    }

    schedule();
    return () => {
      stopped = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [step]);

  useEffect(() => {
    if (!step) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') skip();
      if (event.key === 'ArrowRight') next(visible.length);
      if (event.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [back, next, skip, step, visible.length]);

  if (!step || typeof document === 'undefined') return null;

  /* Place the card below the spotlight when there is room, otherwise above.
     `rect` is null for a step with no anchor on screen (the HOME/PRO opener),
     which centres the card instead of pointing at nothing. */
  const viewportH = typeof window === 'undefined' ? 800 : window.innerHeight;
  const below = spotlight ? spotlight.top + spotlight.height + 16 : viewportH / 2;
  const placeAbove = spotlight !== null && below > viewportH - 190;

  return createPortal(
    <div
      className="fixed inset-0 z-[80]"
      role="dialog"
      aria-modal="true"
      aria-label={step.title}
      data-testid="tutorial-overlay"
      data-tutorial-step={step.id}
      /* Which element the spotlight is currently measured against. `pending`
         means the step changed and its box has not been read yet — visible for
         at most a frame, and the one state a served check needs to be able to
         tell apart from „no anchor at all". */
      data-tutorial-measured={spotlight ? spotlight.anchor : rect ? 'pending' : 'none'}
    >
      {spotlight ? (
        <div
          aria-hidden
          data-testid="tutorial-spotlight"
          className="pointer-events-none absolute"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
            borderRadius: spotlight.radius,
            /* One box, one shadow: the dim can never show a seam, and it takes
               the anchor's own corner radius with it. */
            boxShadow: '0 0 0 100vmax rgb(16 17 19 / 0.62)',
          }}
        />
      ) : (
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ background: 'rgb(16 17 19 / 0.62)' }}
        />
      )}

      {/* Anything not the card swallows the click, so the tutorial cannot
          accidentally press the control it is describing. */}
      <button
        type="button"
        aria-label="Pomiń samouczek"
        tabIndex={-1}
        onClick={skip}
        className="absolute inset-0 size-full cursor-default"
        style={{ background: 'transparent' }}
        data-testid="tutorial-scrim"
      />

      <section
        className={cn(
          'absolute left-1/2 w-[min(92vw,380px)] -translate-x-1/2 rounded-[16px] bg-white p-5 shadow-xl',
        )}
        style={
          spotlight
            ? placeAbove
              ? { top: Math.max(16, spotlight.top - 176) }
              : { top: below }
            : { top: '50%', transform: 'translate(-50%, -50%)' }
        }
        data-testid="tutorial-card"
      >
        <p
          className="text-[11px] font-bold tracking-[0.12em] uppercase"
          style={{ color: 'var(--g-text-muted)' }}
          data-testid="tutorial-counter"
        >
          {index + 1} / {visible.length}
        </p>
        <h2 className="mt-2 text-[17px] font-semibold" style={{ color: 'var(--g-ink)' }}>
          {step.title}
        </h2>
        <p className="mt-2 text-[14px] leading-snug" style={{ color: 'var(--g-text-secondary)' }}>
          {step.body}
        </p>
        <div className="mt-5 flex items-center gap-2">
          <button
            type="button"
            onClick={skip}
            data-testid="tutorial-skip"
            className="pro-focus-ring min-h-11 rounded-full px-4 text-[13px] font-semibold"
            style={{ color: 'var(--g-text-secondary)' }}
          >
            Pomiń
          </button>
          <span className="flex-1" />
          {index > 0 ? (
            <button
              type="button"
              onClick={back}
              data-testid="tutorial-back"
              className="pro-focus-ring min-h-11 rounded-full border px-4 text-[13px] font-semibold"
              style={{ borderColor: 'var(--g-line)', color: 'var(--g-ink)' }}
            >
              Wstecz
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => next(visible.length)}
            data-testid="tutorial-next"
            className="pro-focus-ring min-h-11 rounded-full px-5 text-[13px] font-semibold"
            style={{ background: 'var(--g-ink)', color: '#ffffff' }}
          >
            {index + 1 >= visible.length ? 'Gotowe' : 'Dalej'}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
