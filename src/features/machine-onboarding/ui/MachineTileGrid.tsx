/**
 * §8.2 machine tiles + search. Families only (no dozens of models); disabled
 * families stay VISIBLE with the honest verification note; the last tile is
 * always „Nie widzę mojej maszyny”. Light-native (customer-shell tokens).
 */
import { cn } from '@/lib/cn';
import { TextField } from '@/features/customer-shell/ui/TextField';
import { SelectableCard } from '@/features/customer-shell/ui/SelectableCard';
import { color, type } from '@/features/customer-shell/ui/tokens';
import { machineOnboardingCopy as copy } from '../machineOnboardingCopy';
import type { MachineTileView } from '../machineViews';

interface MachineTileGridProps {
  views: readonly MachineTileView[];
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSelect: (view: MachineTileView) => void;
}

export function MachineTileGrid({ views, searchValue, onSearchChange, onSelect }: MachineTileGridProps) {
  return (
    <div>
      <TextField
        label={copy.intro.searchLabel}
        placeholder={copy.intro.searchPlaceholder}
        value={searchValue}
        onChange={(e) => onSearchChange(e.target.value)}
        autoComplete="off"
      />
      <div className="mt-5 space-y-3" role="radiogroup" aria-label={copy.intro.title}>
        {views.length === 0 ? (
          <p className={cn(type.secondary, color.textSecondary)}>{copy.intro.searchNoResults}</p>
        ) : (
          views.map((view) => (
            <SelectableCard
              key={view.id}
              title={view.label}
              {...(view.note !== null ? { description: view.note } : {})}
              disabled={!view.selectable}
              onSelect={() => onSelect(view)}
            />
          ))
        )}
      </div>
    </div>
  );
}
