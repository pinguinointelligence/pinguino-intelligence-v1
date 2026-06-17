import { cn } from '@/lib/cn';

export interface ChipOption {
  id: string;
  label: string;
  desc?: string;
}

/** Premium choice chips for the guided intake (product type / serving / batch). */
export function ChoiceChips({
  options,
  selectedId,
  onChoose,
}: {
  options: readonly ChipOption[];
  selectedId?: string | null;
  onChoose: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = option.id === selectedId;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChoose(option.id)}
            className={cn(
              'rounded-lg border px-4 py-2.5 text-left transition-colors',
              active
                ? 'border-ivory bg-ivory text-ink'
                : 'border-ivory/20 text-ivory hover:border-ivory/50',
            )}
          >
            <span className="block text-sm">{option.label}</span>
            {option.desc ? (
              <span className={cn('mt-0.5 block text-xs', active ? 'text-ink/65' : 'text-ivory/50')}>
                {option.desc}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
