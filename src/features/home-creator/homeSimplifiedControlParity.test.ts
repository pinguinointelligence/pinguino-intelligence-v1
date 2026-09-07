/**
 * OWNER PARITY CONTRACT — a simplified HOME control is a PROJECTION of the exact
 * PRO state, never a normaliser of it.
 *
 * HOME shows LESS / NORMAL / MORE; PRO's Direction axis is −2…+2. The rule has a
 * sharp edge: *viewing* HOME must not collapse a PRO ±2, and only a deliberate
 * HOME tap may replace the precise value with HOME's own simpler choice
 * (LESS → −1, NORMAL → 0, MORE → +1).
 *
 * The failure mode this pins is silent precision loss: one "normalise" helper
 * called on render would flatten every Pro user's ±2 the moment they glanced at
 * HOME. Proven per profile, because the HOME simplification contract is common
 * while the physics underneath is profile-specific.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useRecipeStore } from '@/stores/recipeStore';
import {
  HOME_SWEETNESS_VALUE,
  projectSweetnessForDisplay,
  sweetnessValueForTap,
  tapChangesStoredValue,
  type HomeSweetness,
} from './homeSweetness';

const PROFILES = ['gelato', 'sorbet', 'vegan', 'protein'] as const;
const st = () => useRecipeStore.getState();
const sweetness = () => st().direction_targets.sweetness;
const softness = () => st().direction_targets.softness;

/** Exactly what HomeCreatorPage does on a tap (`HomeCreatorPage.tsx:403`). */
const homeTap = (choice: HomeSweetness) => {
  if (!tapChangesStoredValue(sweetness(), choice)) return;
  st().setDirectionTarget('sweetness', sweetnessValueForTap(choice));
};
/** Opening HOME renders the projection — a read that must write nothing. */
const openHome = () => projectSweetnessForDisplay(sweetness());

describe.each(PROFILES)('HOME simplified-control parity — %s', (profile) => {
  beforeEach(() => {
    useRecipeStore.getState().startNewRecipe(profile as never);
  });

  // ---- display projection is many-to-one -----------------------------------
  it('projects −2/−1 → LESS, 0 → NORMAL, +1/+2 → MORE', () => {
    const cases: Array<[-2 | -1 | 0 | 1 | 2, HomeSweetness]> = [
      [-2, 'less'], [-1, 'less'], [0, 'balanced'], [1, 'sweeter'], [2, 'sweeter'],
    ];
    for (const [stored, label] of cases) {
      st().setDirectionTarget('sweetness', stored);
      expect(openHome(), `stored ${stored}`).toBe(label);
    }
  });

  // ---- CASES A/B/C — viewing HOME preserves the exact PRO value -------------
  it.each([-2, -1, 1, 2] as const)('PRO %s survives opening HOME with no edit', (stored) => {
    st().setDirectionTarget('sweetness', stored);
    openHome();            // render
    openHome();            // re-render
    expect(sweetness()).toBe(stored);
  });

  it('tapping the ALREADY-ACTIVE segment does not rewrite a ±2', () => {
    st().setDirectionTarget('sweetness', 2);
    homeTap('sweeter');                       // same label as displayed
    expect(sweetness()).toBe(2);
    st().setDirectionTarget('sweetness', -2);
    homeTap('less');
    expect(sweetness()).toBe(-2);
  });

  // ---- CASES D/E/F — a deliberate edit replaces the precise value -----------
  it('CASE D — PRO −2, user taps MORE → +1', () => {
    st().setDirectionTarget('sweetness', -2);
    homeTap('sweeter');
    expect(sweetness()).toBe(1);
  });

  it('CASE E — PRO +2, user taps LESS → −1', () => {
    st().setDirectionTarget('sweetness', 2);
    homeTap('less');
    expect(sweetness()).toBe(-1);
  });

  it('CASE F — a HOME edit to neutral → 0', () => {
    st().setDirectionTarget('sweetness', 2);
    homeTap('balanced');
    expect(sweetness()).toBe(0);
  });

  it('a HOME tap never writes ±2 — it has no memory of the previous value', () => {
    for (const choice of ['less', 'balanced', 'sweeter'] as const) {
      expect(Math.abs(HOME_SWEETNESS_VALUE[choice])).toBeLessThanOrEqual(1);
      expect(sweetnessValueForTap(choice)).toBe(HOME_SWEETNESS_VALUE[choice]);
    }
  });

  // ---- HOME → PRO → HOME roundtrip persistence -----------------------------
  it.each([-2, -1, 0, 1, 2] as const)(
    'HOME→PRO→HOME leaves a stored %s untouched when nothing is edited',
    (stored) => {
      st().setDirectionTarget('sweetness', stored);
      const shown = openHome();          // HOME renders
      // "switch to PRO": PRO reads the canonical axis directly.
      expect(st().direction_targets.sweetness).toBe(stored);
      // "switch back to HOME": render again, still no edit.
      expect(openHome()).toBe(shown);
      expect(sweetness()).toBe(stored);
    },
  );

  it('a deliberate HOME edit survives the roundtrip as HOME\'s own value', () => {
    st().setDirectionTarget('sweetness', -2);
    openHome();
    homeTap('sweeter');                  // explicit edit → +1
    expect(sweetness()).toBe(1);
    expect(openHome()).toBe('sweeter');  // back in HOME, displayed as MORE
    expect(sweetness()).toBe(1);         // and still exactly +1, not restored to −2
  });

  // ---- §63/§64 — a sweetness edit may not move another axis -----------------
  it('a HOME sweetness edit leaves hardness untouched', () => {
    st().setDirectionTarget('softness', 2);
    st().setDirectionTarget('sweetness', -2);
    openHome();
    homeTap('sweeter');
    expect(sweetness()).toBe(1);
    expect(softness(), 'hardness must not move').toBe(2);
  });
});
