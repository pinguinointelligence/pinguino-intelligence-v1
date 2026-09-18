/**
 * DESIGN V3.0 HOME (VI + XIII) — „Reset receptury?”.
 *
 * The same question PRO asks before discarding unsaved work, in HOME's words, as a
 * compact bottom layer: „Reset” (red, destructive) | „Wróć” (black, the safe default and
 * the first focus). What „Reset” does is the page's existing new-draft door — the one the
 * Recipes hub uses for HOME — never a second reset.
 */
import { homeCreatorCopy } from '../homeCreatorCopy';
import {
  HomeLayer,
  HomeLayerFoot,
  HomeLayerHeading,
  homeLayerDangerButton,
  homeLayerPrimaryButton,
} from './HomeLayer';

const copy = homeCreatorCopy.recipeScreen;

export function HomeResetSheet({
  onReset,
  onCancel,
}: {
  onReset: () => void;
  onCancel: () => void;
}) {
  return (
    <HomeLayer
      label={copy.resetTitle}
      testId="home-reset-sheet"
      onClose={onCancel}
      initialFocusTestId="home-reset-keep"
    >
      <HomeLayerHeading title={copy.resetTitle} subtitle={copy.resetBody} />
      <HomeLayerFoot>
        <button
          type="button"
          className={homeLayerDangerButton}
          data-testid="home-reset-confirm"
          onClick={onReset}
        >
          {copy.resetConfirm}
        </button>
        <button
          type="button"
          className={homeLayerPrimaryButton}
          data-testid="home-reset-keep"
          onClick={onCancel}
        >
          {copy.resetKeep}
        </button>
      </HomeLayerFoot>
    </HomeLayer>
  );
}
