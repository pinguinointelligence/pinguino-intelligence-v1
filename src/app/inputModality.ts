export const GELLATTI_INPUT_MODALITY_ATTRIBUTE = 'data-gellatti-input-modality';

const MODIFIER_ONLY_KEYS = new Set(['Shift', 'Alt', 'AltGraph', 'Control', 'Meta', 'OS']);

export type GellattiInputModality = 'pointer' | 'keyboard';

/**
 * Installs the single input-modality authority used by the Gellatti focus CSS.
 * Modifier keys intentionally do nothing; Shift+Tab is still a Tab event and
 * therefore remains discoverable keyboard navigation.
 */
export function installInputModalityAuthority(doc: Document): () => void {
  const root = doc.documentElement;
  const setModality = (modality: GellattiInputModality) =>
    root.setAttribute(GELLATTI_INPUT_MODALITY_ATTRIBUTE, modality);
  const onPointerDown = () => setModality('pointer');
  const onKeyDown = (event: KeyboardEvent) => {
    if (MODIFIER_ONLY_KEYS.has(event.key)) return;
    setModality('keyboard');
  };

  setModality('pointer');
  doc.addEventListener('pointerdown', onPointerDown, true);
  doc.addEventListener('keydown', onKeyDown, true);

  return () => {
    doc.removeEventListener('pointerdown', onPointerDown, true);
    doc.removeEventListener('keydown', onKeyDown, true);
    root.removeAttribute(GELLATTI_INPUT_MODALITY_ATTRIBUTE);
  };
}
