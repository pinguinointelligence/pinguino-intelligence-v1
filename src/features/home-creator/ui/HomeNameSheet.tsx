/**
 * DESIGN V3.0 HOME (§10 + XIII) — the name panel from the bottom.
 *
 * §53 still holds: the name is a plain editable field with no separate naming step and
 * no save. It moved from the page into this bottom layer because the title now reads
 * „Nazwij swoje lody ✎”: a tap opens the real field (the keyboard lifts the layer), „OK”
 * or „Gotowe” keeps the name through the SAME setter the inline field used, „Anuluj”
 * keeps the previous one.
 */
import { useState } from 'react';
import { homeCreatorCopy } from '../homeCreatorCopy';
import {
  HomeLayer,
  HomeLayerFoot,
  HomeLayerHeading,
  homeLayerPrimaryButton,
  homeLayerTextButton,
} from './HomeLayer';

const copy = homeCreatorCopy.recipeScreen;

export function HomeNameSheet({
  name,
  onDone,
  onCancel,
}: {
  name: string;
  onDone: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(name);
  return (
    <HomeLayer
      label={copy.nameTitle}
      testId="home-name-sheet"
      onClose={onCancel}
      initialFocusTestId="home-recipe-name"
    >
      <HomeLayerHeading title={copy.nameTitle} subtitle={copy.nameHint} />
      <label className="mt-4 block shrink-0">
        <span className="sr-only">{homeCreatorCopy.recipe.nameLabel}</span>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onDone(value);
            }
          }}
          aria-label={homeCreatorCopy.recipe.nameLabel}
          placeholder={homeCreatorCopy.recipe.namePlaceholder}
          enterKeyHint="done"
          autoComplete="off"
          data-testid="home-recipe-name"
          className="h-12 w-full rounded-[14px] border border-[var(--g-line)] bg-white px-4 text-[17px] text-[var(--g-ink)] outline-none focus:border-[var(--g-ink)] focus:shadow-[0_0_0_3px_rgba(16,17,19,0.08)]"
        />
      </label>
      <HomeLayerFoot>
        <button
          type="button"
          className={homeLayerTextButton}
          data-testid="home-name-cancel"
          onClick={onCancel}
        >
          {copy.nameCancel}
        </button>
        <button
          type="button"
          className={homeLayerPrimaryButton}
          data-testid="home-name-done"
          onClick={() => onDone(value)}
        >
          {copy.nameDone}
        </button>
      </HomeLayerFoot>
    </HomeLayer>
  );
}
