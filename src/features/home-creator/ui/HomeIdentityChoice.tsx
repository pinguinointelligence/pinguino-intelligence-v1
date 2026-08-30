/**
 * §23 — "Which product is it?"
 *
 * Shown only where the catalogue genuinely offers materially different REAL products
 * for what the user said. It exists because the alternative is worse than a question:
 * `truskawka` matches `STRAWBERRIES · Fresh Fruit`, `CHUPA CHUPS STRAWBERRY LOLLIPOP`
 * and `FANTA STRAWBERRY` equally well by name, and silently adopting any of them would
 * put an ingredient in the recipe that the person never asked for (§22).
 *
 * §23 also says no photos are required here — these are real catalogue identities, and
 * the name is what distinguishes them.
 */
import { homeCreatorCopy } from '../homeCreatorCopy';
import type { IntentChip } from '../homeDraftStore';

export function HomeIdentityChoice({
  chip,
  onChoose,
}: {
  chip: IntentChip;
  onChoose: (candidate: { id: string; name: string }) => void;
}) {
  const candidates = chip.candidates ?? [];
  if (!chip.ambiguous || candidates.length === 0) return null;

  return (
    <div
      className="mt-4 rounded-[12px] border p-4"
      data-testid="home-identity-choice"
      style={{ borderColor: 'var(--g-orange)', background: 'var(--g-preflight-surface)' }}
    >
      <p className="text-[15px] font-semibold" style={{ color: 'var(--g-ink)' }}>
        {homeCreatorCopy.identity.whichProduct}
      </p>
      <p className="mt-0.5 text-[13px]" style={{ color: 'var(--g-text-muted)' }}>
        {chip.label} · {homeCreatorCopy.identity.whichProductHint}
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {candidates.map((candidate) => (
          <li key={candidate.id}>
            <button
              type="button"
              onClick={() => onChoose(candidate)}
              data-testid={`home-identity-option-${candidate.id}`}
              className="w-full rounded-[10px] border px-4 py-3 text-left text-[14px] transition-colors hover:bg-black/[0.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
              style={{ borderColor: 'var(--g-line)', background: '#ffffff', color: 'var(--g-ink)' }}
            >
              {candidate.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
