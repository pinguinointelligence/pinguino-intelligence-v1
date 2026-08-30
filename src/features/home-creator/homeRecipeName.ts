/**
 * §53 — propose a natural recipe name automatically. PURE.
 *
 * The name is a SUGGESTION the user may overwrite immediately (§53: no separate naming
 * step), so it must read like something a person would write, not like a formulation
 * summary. It is built from what the user actually asked for, in their own words.
 */
import { homeCreatorCopy } from './homeCreatorCopy';
import type { IntentProfile } from './homeIntentParsing';

const PROFILE_NOUN: Readonly<Record<IntentProfile, string>> = {
  gelato: homeCreatorCopy.profile.gelato,
  sorbet: homeCreatorCopy.profile.sorbet,
  protein: homeCreatorCopy.profile.protein,
  vegan: homeCreatorCopy.profile.vegan,
};

const titleCase = (value: string): string =>
  value
    .trim()
    .split(/\s+/)
    .map((word) => (word ? word[0]!.toUpperCase() + word.slice(1).toLowerCase() : word))
    .join(' ');

/**
 * "Truskawka Sorbet", "Banan i Oreo Gelato". At most two flavours: a name listing five
 * ingredients is a label, not a name, and the user is about to retype it anyway.
 */
export function proposeRecipeName(input: {
  readonly flavourLabels: readonly string[];
  readonly profile: IntentProfile | null;
}): string {
  const flavours = input.flavourLabels
    .map((label) => titleCase(label))
    .filter((label) => label.length > 0)
    .slice(0, 2);
  const profileNoun = input.profile ? PROFILE_NOUN[input.profile] : null;

  if (flavours.length === 0) return profileNoun ?? homeCreatorCopy.recipe.namePlaceholder;
  const flavourPart = flavours.join(' & ');
  return profileNoun ? `${flavourPart} ${profileNoun}` : flavourPart;
}
