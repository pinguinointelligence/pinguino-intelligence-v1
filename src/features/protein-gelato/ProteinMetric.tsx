import { ProteinStructureIcon } from '@/components/icons/PinguinoIcons';
import { cn } from '@/lib/cn';
import { formatProteinPercentPl } from './proteinReadout';

const formatEnergySharePercentPl = (percent: number): string =>
  `${Math.round(percent).toLocaleString('pl-PL')}%`;

/**
 * The single compact Protein result used beside the workbench Score and in the
 * full Monitor. Values are read-only domain outputs; no nutrition formula is
 * duplicated in the UI.
 */
export function ProteinMetric({
  proteinPercent,
  energySharePercent,
  testId = 'protein-metric',
  className,
}: {
  proteinPercent: number | null;
  energySharePercent: number | null;
  testId?: string;
  className?: string;
}) {
  if (
    proteinPercent === null ||
    energySharePercent === null ||
    !Number.isFinite(proteinPercent) ||
    !Number.isFinite(energySharePercent)
  ) {
    return null;
  }

  const protein = formatProteinPercentPl(proteinPercent);
  const energy = formatEnergySharePercentPl(energySharePercent);
  return (
    <span
      className={cn(
        'inline-flex h-11 shrink-0 items-center gap-2 rounded-[10px] border border-ink/10 bg-white px-2.5 text-ink shadow-pro-e0',
        className,
      )}
      aria-label={`${protein} białka, ${energy} energii z białka`}
      data-testid={testId}
      data-protein-percent={proteinPercent}
      data-protein-energy-share-percent={energySharePercent}
    >
      <ProteinStructureIcon className="size-5" />
      <span className="font-mono text-[10px] font-semibold leading-[1.35] tabular-nums">
        <span className="block">{protein} białka</span>
        <span className="block text-stone-600">{energy} energii</span>
      </span>
    </span>
  );
}
