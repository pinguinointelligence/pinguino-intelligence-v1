import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type TouchEvent } from 'react';
import { useSearchParams } from 'react-router';
import { educationCopy } from '@/copy/education.pl';
import { knowledgeTourSteps, type KnowledgeTourStep } from './knowledgeTourModel';
import './KnowledgeTour.css';

const STEP_COUNT = 9;
const SWIPE_DISTANCE_PX = 56;

function stepFromSearch(rawStep: string | null): number {
  const parsed = Number.parseInt(rawStep ?? '', 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(STEP_COUNT - 1, Math.max(0, parsed - 1));
}

function Arrow({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      aria-hidden="true"
      width="22"
      height="14"
      viewBox="0 0 22 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={direction === 'left' ? undefined : { transform: 'scaleX(-1)' }}
    >
      <path d="M21 7H1M1 7L7 1M1 7L7 13" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

function AnnotationRail({ step }: { step: KnowledgeTourStep }) {
  const captionWidth = (index: number) => {
    const anchor = step.annotations[index]!.anchorX;
    const previousGap = index === 0 ? anchor * 2 : anchor - step.annotations[index - 1]!.anchorX;
    const nextGap =
      index === step.annotations.length - 1
        ? (1 - anchor) * 2
        : step.annotations[index + 1]!.anchorX - anchor;
    return Math.min(previousGap, nextGap) * 92;
  };

  return (
    <>
      <div
        className="knowledge-tour__annotations"
        data-compact-mobile={step.compactMobileAnnotations}
      >
        {step.annotations.map((annotation, index) => (
          <div
            className="knowledge-tour__annotation"
            data-annotation={annotation.id}
            key={annotation.id}
            style={
              {
                '--tour-anchor-x': `${annotation.anchorX * 100}%`,
                '--tour-caption-width': `${captionWidth(index)}%`,
              } as CSSProperties
            }
          >
            <span className="knowledge-tour__annotation-index" aria-hidden="true">
              {index + 1}
            </span>
            <strong className="knowledge-tour__annotation-title">{annotation.title}</strong>
            <span className="knowledge-tour__annotation-detail">{annotation.detail}</span>
          </div>
        ))}
      </div>

      <div
        className="knowledge-tour__mobile-notes"
        data-visible={step.compactMobileAnnotations}
        aria-hidden={!step.compactMobileAnnotations}
      >
        {step.annotations.map((annotation, index) => (
          <div className="knowledge-tour__mobile-note" key={annotation.id}>
            <span className="knowledge-tour__mobile-note-index">{index + 1}</span>
            <span>{annotation.detail}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export function KnowledgeTour() {
  const [searchParams, setSearchParams] = useSearchParams();
  const steps = knowledgeTourSteps();
  const activeIndex = stepFromSearch(searchParams.get('step'));
  // The progressive story is model-locked to nine steps and is deliberately
  // independent from the HOME / PRO selector in the surrounding AppShell.
  const step = steps[activeIndex]!;
  const titleRef = useRef<HTMLHeadingElement>(null);
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const copy = educationCopy.knowledgeTour;

  const goTo = (index: number) => {
    const nextIndex = Math.min(steps.length - 1, Math.max(0, index));
    const next = new URLSearchParams(searchParams);
    next.set('step', String(nextIndex + 1));
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, [activeIndex]);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowLeft' && activeIndex > 0) {
      event.preventDefault();
      goTo(activeIndex - 1);
    }
    if (event.key === 'ArrowRight' && activeIndex < steps.length - 1) {
      event.preventDefault();
      goTo(activeIndex + 1);
    }
  };

  const handleTouchStart = (event: TouchEvent<HTMLElement>) => {
    const touch = event.changedTouches[0];
    touchRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };

  const handleTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const origin = touchRef.current;
    touchRef.current = null;
    const touch = event.changedTouches[0];
    if (!origin || !touch) return;

    const distanceX = touch.clientX - origin.x;
    const distanceY = touch.clientY - origin.y;
    if (
      Math.abs(distanceX) < SWIPE_DISTANCE_PX ||
      Math.abs(distanceX) <= Math.abs(distanceY) * 1.2
    ) {
      return;
    }

    if (distanceX < 0 && activeIndex < steps.length - 1) goTo(activeIndex + 1);
    if (distanceX > 0 && activeIndex > 0) goTo(activeIndex - 1);
  };

  return (
    <section
      className="knowledge-tour"
      data-testid="knowledge-tour"
      data-active-step={activeIndex + 1}
      data-owner-asset={step.ownerAsset}
      data-swipe-enabled="true"
      onKeyDown={handleKeyDown}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="knowledge-tour__stage">
        <div className="knowledge-tour__copy">
          <p className="knowledge-tour__eyebrow">
            {copy.navigation.step} {activeIndex + 1} {copy.navigation.of} {steps.length}
          </p>
          <h1 className="knowledge-tour__title" ref={titleRef} tabIndex={-1}>
            {step.title}
          </h1>
          <p className="knowledge-tour__body">{step.body}</p>
          <p className="knowledge-tour__voice">{step.voice}</p>
        </div>

        <div className="knowledge-tour__story">
          <figure
            className="knowledge-tour__artwork"
            style={{ '--tour-image-edge': step.edgeColor } as CSSProperties}
          >
            <img
              src={step.image}
              alt={`${copy.imageAltPrefix} ${step.title}`}
              draggable={false}
              width="1672"
              height="941"
            />
          </figure>
          <AnnotationRail step={step} />
        </div>
      </div>

      <nav className="knowledge-tour__navigation" aria-label={copy.navigation.label}>
        <button
          type="button"
          className="knowledge-tour__nav-button"
          onClick={() => goTo(activeIndex - 1)}
          disabled={activeIndex === 0}
          aria-label={copy.navigation.back}
        >
          <Arrow direction="left" />
          <span className="knowledge-tour__nav-label">{copy.navigation.back}</span>
        </button>

        <div className="knowledge-tour__progress" aria-label={copy.navigation.progress}>
          {steps.map((progressStep, index) => (
            <button
              type="button"
              className="knowledge-tour__dot"
              key={progressStep.id}
              onClick={() => goTo(index)}
              aria-current={index === activeIndex ? 'step' : undefined}
              aria-label={`${copy.navigation.goToStep} ${index + 1}: ${progressStep.title}`}
            />
          ))}
        </div>

        <button
          type="button"
          className="knowledge-tour__nav-button"
          onClick={() => goTo(activeIndex === steps.length - 1 ? 0 : activeIndex + 1)}
          aria-label={
            activeIndex === steps.length - 1 ? copy.navigation.restart : copy.navigation.next
          }
        >
          <span className="knowledge-tour__nav-label">
            {activeIndex === steps.length - 1 ? copy.navigation.restart : copy.navigation.next}
          </span>
          <Arrow direction="right" />
        </button>
      </nav>
    </section>
  );
}
