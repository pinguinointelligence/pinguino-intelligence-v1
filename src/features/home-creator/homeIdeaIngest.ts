/**
 * §19 — ONE ingestion path for every way an idea arrives: typed text, voice, the fruit
 * camera, and (DESIGN V3.0 IX) a flavour typed into the „Receptury” search that found no
 * recipe and is carried over to „Twój pomysł”.
 *
 * The text is parsed by the SAME `parseIntent` the composer always used and lands as
 * the same chips; nothing here resolves, matches or decides — that stays with the chips'
 * own resolution door.
 */
import { useHomeDraftStore, type IntentChip } from './homeDraftStore';
import { parseIntent } from './homeIntentParsing';

const chipId = (): string =>
  `chip_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

export function ingestIdeaText(text: string, source: IntentChip['source']): void {
  const parsed = parseIntent(text);
  const draft = useHomeDraftStore.getState();
  // §31: a stated profile is remembered so it is never asked again. An earlier
  // explicit profile wins — a later sentence should not silently retype it.
  if (parsed.profile && draft.profile === null) draft.setProfile(parsed.profile);
  for (const term of parsed.terms) {
    draft.addChip({
      id: chipId(),
      label: term.raw,
      concept: term.concept,
      role: term.role,
      segment: term.segment,
      utterance: term.utterance,
      segmentIndex: term.segmentIndex,
      source,
      productId: null,
      productName: null,
      ambiguous: false,
    });
  }
}
