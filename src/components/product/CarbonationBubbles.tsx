import type { CarbonationStatus } from '@/data/products/carbonation';
import { cn } from '@/lib/cn';

/** A deliberately quiet process marker. UNKNOWN and NON_CARBONATED render no UI. */
export function CarbonationBubbles({
  status,
  className,
}: {
  status: CarbonationStatus | null | undefined;
  className?: string;
}) {
  if (status !== 'CARBONATED') return null;
  return (
    <span
      role="img"
      aria-label="Napój gazowany"
      title="Napój gazowany"
      data-testid="carbonation-bubbles"
      className={cn('relative inline-block h-4 w-4 shrink-0 text-sky-500/75', className)}
    >
      <span className="absolute right-0 top-0 size-1.5 rounded-full border border-current" />
      <span className="absolute bottom-0.5 left-0 size-2 rounded-full border border-current" />
      <span className="absolute bottom-0 right-0 size-1 rounded-full bg-current/20 ring-1 ring-current" />
    </span>
  );
}
