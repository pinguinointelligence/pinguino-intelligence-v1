import { Button } from '@/components/ui/Button';
import { copy } from '@/copy/en';
import { cn } from '@/lib/cn';
import { SectionLabel } from './SectionLabel';

interface UpgradePromptProps {
  message: string;
  cta?: string;
  onAction?: () => void;
  className?: string;
}

/**
 * Premium upgrade card shown at the moment of intent (Masterplan §6 — demo sales
 * flow). No payment logic here — `onAction` is wired by the caller (Stripe in Phase 4).
 */
export function UpgradePrompt({ message, cta, onAction, className }: UpgradePromptProps) {
  return (
    <div
      className={cn(
        'max-w-sm rounded-md border border-ink/10 bg-paper p-6 text-center shadow-sm',
        className,
      )}
    >
      <SectionLabel className="justify-center">{copy.gate.proLabel}</SectionLabel>
      <p className="mt-3 text-sm leading-relaxed text-stone-600">{message}</p>
      <Button variant="primary" size="sm" className="mt-5" onClick={onAction}>
        {cta ?? copy.gate.unlockCta}
      </Button>
    </div>
  );
}
