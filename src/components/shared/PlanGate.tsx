import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { UpgradePrompt } from './UpgradePrompt';

interface PlanGateProps {
  /** Gating decision — will be driven by the access capability matrix (Masterplan §5). */
  locked: boolean;
  /** Upgrade message shown while locked (teaser copy from src/copy). */
  prompt: string;
  cta?: string;
  onUpgrade?: () => void;
  /**
   * Decorative stand-in rendered blurred behind the prompt while locked.
   * MUST contain placeholder content only — never real values.
   */
  preview?: ReactNode;
  /** Real content. NOT mounted while locked (redact-at-source, Masterplan §10). */
  children: ReactNode;
  className?: string;
}

/**
 * The single gating primitive (Masterplan §5–§6, §10).
 *
 * While `locked`, `children` are never rendered or mounted — locked sessions
 * (e.g. Demo) cannot receive exact values through the DOM. Only the decorative
 * `preview` and the upgrade prompt are shown.
 */
export function PlanGate({
  locked,
  prompt,
  cta,
  onUpgrade,
  preview,
  children,
  className,
}: PlanGateProps) {
  if (!locked) return <>{children}</>;

  if (!preview) {
    return (
      <div className={cn('flex justify-center', className)}>
        <UpgradePrompt message={prompt} cta={cta} onAction={onUpgrade} />
      </div>
    );
  }

  return (
    <div className={cn('relative overflow-hidden rounded-md', className)}>
      <div aria-hidden className="pointer-events-none blur-[3px] select-none" inert>
        {preview}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-paper/70 p-6">
        <UpgradePrompt message={prompt} cta={cta} onAction={onUpgrade} />
      </div>
    </div>
  );
}
