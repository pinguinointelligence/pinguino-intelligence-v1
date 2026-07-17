/**
 * §7.3 recipe machine context bar — presentational (owner correction 2026-07-17:
 * two clearly-separated machine levels).
 *
 * DEFAULT (recipe uses the profile machine):
 *   Twoja maszyna: KitchenAid Ice Cream Maker · pojemnik …   [Zmień dla tej receptury]
 *
 * OVERRIDE (recipe uses a temporary machine, profile untouched):
 *   Maszyna dla tej receptury: Ninja CREAMi · pojemnik …     [Zmień dla tej receptury]
 *   Domyślna maszyna: KitchenAid Ice Cream Maker    [Wróć do domyślnej] [Ustaw … jako domyślną]
 *
 * Hard rules (spec-pinned): NO engine name, NO technology code, NO
 * auto-chosen temperature. The capacity figure comes from the resolved catalog
 * record OR, once the user declared their own container (§8), from that own
 * container — both via `buildMachineContextView`. The bar never edits the
 * profile: „Zmień dla tej receptury” is recipe-scope; only the explicit
 * „Ustaw … jako domyślną” promotes an override to the profile default.
 */
import { cn } from '@/lib/cn';
import { color, focusRing, motion, radius, type } from '@/features/customer-shell/ui/tokens';
import { machineOnboardingCopy as copy } from '../machineOnboardingCopy';
import type { MachineContextView } from '../machineViews';

/** Present only when the recipe uses a temporary override machine. */
export interface MachineContextOverride {
  /** The profile default machine name (shown small, „Domyślna maszyna: X”). */
  readonly defaultName: string;
  /** Drop the override, return the recipe to the profile default. */
  readonly onRevert: () => void;
  /** Promote the override machine to the profile default (conscious). */
  readonly onSetAsDefault: () => void;
}

interface MachineContextBarProps {
  /** The machine CURRENTLY used by the recipe (default or override). */
  view: MachineContextView;
  /** „Zmień dla tej receptury” — recipe-scope change; never touches the profile. */
  onChange: () => void;
  /** Non-null only while a recipe override is active. */
  override?: MachineContextOverride | null;
  className?: string;
}

const linkButton = cn(
  'shrink-0 px-3 py-2 underline underline-offset-4 min-h-[44px]',
  radius.control,
  type.secondary,
  color.textPrimary,
  motion.base,
  focusRing,
  'hover:bg-ink/[0.04] active:bg-ink/[0.06]',
);

export function MachineContextBar({ view, onChange, override = null, className }: MachineContextBarProps) {
  return (
    <div className={cn('border-b border-ink/10 bg-paper', className)}>
      <div className="flex min-h-[44px] items-center gap-2 px-4 py-2">
        <p className={cn('min-w-0 flex-1 truncate', type.secondary, color.textSecondary)}>
          {override !== null ? copy.contextBar.overridePrefix : copy.contextBar.prefix}{' '}
          <span className={cn('font-medium', color.textPrimary)}>{view.name}</span>
          {view.vesselMl !== null ? <span> · {copy.contextBar.vessel(view.vesselMl)}</span> : null}
        </p>
        <button
          type="button"
          onClick={onChange}
          aria-label={copy.contextBar.changeForRecipeAria}
          className={linkButton}
        >
          {copy.contextBar.changeForRecipe}
        </button>
      </div>

      {/* Override → show the profile default the recipe is NOT using, plus the
          two conscious actions (revert / promote to default). */}
      {override !== null ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-2">
          <span className={cn(type.caption, color.textMuted)}>
            {copy.contextBar.defaultPrefix}{' '}
            <span className={color.textSecondary}>{override.defaultName}</span>
          </span>
          <button type="button" onClick={override.onRevert} className={cn(linkButton, type.caption)}>
            {copy.contextBar.revertToDefault}
          </button>
          <button type="button" onClick={override.onSetAsDefault} className={cn(linkButton, type.caption)}>
            {copy.contextBar.setAsDefault(view.name)}
          </button>
        </div>
      ) : null}
    </div>
  );
}
