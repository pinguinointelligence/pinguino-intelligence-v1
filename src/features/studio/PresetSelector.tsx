import { SectionLabel } from '@/components/shared/SectionLabel';
import { copy } from '@/copy/en';
import { DEMO_PRESETS } from '@/data/demoPresets';
import { cn } from '@/lib/cn';
import { useRecipeStore } from '@/stores/recipeStore';

const p = copy.studio.presets;

/** Curated demo scenario switcher — loads a full recipe atomically (Step 5C). */
export function PresetSelector() {
  const activePresetId = useRecipeStore((state) => state.activePresetId);
  const loadPreset = useRecipeStore((state) => state.loadPreset);

  const activeBlurb = activePresetId ? p.items[activePresetId].blurb : null;

  return (
    <div>
      <SectionLabel>{p.label}</SectionLabel>
      <div className="mt-3 flex flex-wrap gap-2">
        {DEMO_PRESETS.map((preset) => {
          const active = preset.id === activePresetId;
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={active}
              onClick={() => loadPreset(preset)}
              className={cn(
                'rounded-md border px-3 py-1.5 text-sm transition-colors',
                active
                  ? 'border-ivory bg-ivory text-shell'
                  : 'border-ivory/15 text-ivory/70 hover:border-ivory/40',
              )}
            >
              {p.items[preset.id].label}
            </button>
          );
        })}
      </div>
      {activeBlurb ? <p className="mt-2.5 text-xs leading-relaxed text-ivory/65">{activeBlurb}</p> : null}
    </div>
  );
}
