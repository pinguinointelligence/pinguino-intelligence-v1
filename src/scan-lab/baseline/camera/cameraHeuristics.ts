import type { CameraOption } from '../types';

const ULTRAWIDE = /ultra[\s-]?wide|wide[\s-]?angle|0[.,]5\s?x|\buw\b|camera2 2\b|ultraszerokok/i;
const NON_PRIMARY =
  /telephoto|\btele\b|długoogniskow|macro|makro|depth|infrared|\bir\b|camera2 3\b|camera2 4\b/i;
const BACK = /back|rear|environment|tyln|world/i;
const FRONT = /front|user|face|przedn|selfie/i;
const IOS_VIRTUAL_MULTI = /dual|triple|dwuobiektywow|trójobiektywow/i;
const IOS_SINGLE_WIDE = /^(back camera|tylny aparat)$/i;
const ANDROID_PRIMARY = /camera2 0\b|camera 0\b|\bmain\b|primary/i;

/**
 * Ranks enumerated cameras for barcode scanning without any device identifier: labels only.
 * Lower `primaryRank` is better. Labels are empty before permission is granted — callers must
 * re-enumerate after the first getUserMedia succeeds.
 */
export function rankCameras(
  devices: ReadonlyArray<Pick<MediaDeviceInfo, 'deviceId' | 'label' | 'kind'>>,
): CameraOption[] {
  const options: CameraOption[] = [];
  let index = 0;
  for (const device of devices) {
    if (device.kind !== 'videoinput') continue;
    const label = device.label || `Kamera ${index + 1}`;
    const facing: CameraOption['facing'] = FRONT.test(label)
      ? 'user'
      : BACK.test(label)
        ? 'environment'
        : 'unknown';
    const likelyUltrawide = ULTRAWIDE.test(label);
    const nonPrimary = NON_PRIMARY.test(label);
    let rank = 2;
    let lensNote: string | null = null;
    if (facing === 'user') rank = 6;
    else if (likelyUltrawide) {
      rank = 4;
      lensNote =
        'Prawdopodobnie obiektyw ultraszerokokątny (stała ostrość) — zły wybór do kodów kreskowych.';
    } else if (nonPrimary) {
      rank = 5;
      lensNote = 'Obiektyw specjalny (tele/makro/głębia) — nie używać do testu.';
    } else if (IOS_SINGLE_WIDE.test(label)) rank = 0;
    else if (IOS_VIRTUAL_MULTI.test(label)) {
      rank = 1;
      lensNote =
        'Wirtualna kamera wieloobiektywowa iOS — może sama przełączyć się na ultraszerokokątny z bliska (tryb makro).';
    } else if (ANDROID_PRIMARY.test(label)) rank = 0;
    else if (facing === 'environment') rank = 1;
    options.push({
      deviceId: device.deviceId,
      label,
      facing,
      likelyUltrawide,
      primaryRank: rank,
      lensNote,
    });
    index += 1;
  }
  // Stable: rank, then original enumeration order (Android lists the primary sensor first in most builds).
  return options
    .map((o, i) => ({ o, i }))
    .sort((a, b) => a.o.primaryRank - b.o.primaryRank || a.i - b.i)
    .map(({ o }) => o);
}

/**
 * Cheap check of the selected track for a likely-ultrawide / fixed-focus misselection (no identifiers).
 * Note10+ evidence (2026-09-04): `facingMode: environment` delivered "camera 2" whose CAPABILITIES listed
 * focusMode ["manual"] only and a 16 MP sensor while SETTINGS still claimed focusMode "continuous" — the
 * capabilities are the honest signal.
 */
export function ultrawideSuspicionFromSettings(
  settings: Record<string, unknown>,
  selected: CameraOption | null,
  capabilities: Record<string, unknown> | null = null,
): { suspicious: boolean; reason: string | null } {
  if (selected?.likelyUltrawide) {
    return { suspicious: true, reason: 'Etykieta kamery wskazuje na obiektyw ultraszerokokątny.' };
  }
  const capFocus = capabilities?.['focusMode'];
  if (Array.isArray(capFocus) && capFocus.length > 0 && !capFocus.includes('continuous')) {
    return {
      suspicious: true,
      reason:
        'Ta kamera nie oferuje ciągłego ustawiania ostrości (możliwości: tylko manual) — zwykle obiektyw ultraszerokokątny ze stałą ostrością.',
    };
  }
  const focusMode = settings['focusMode'];
  const focusDistance = settings['focusDistance'];
  if (focusMode === 'manual' && typeof focusDistance === 'number' && focusDistance === 0) {
    return {
      suspicious: true,
      reason: 'Ustawienia toru wskazują na stałą ostrość (focusMode=manual, focusDistance=0).',
    };
  }
  return { suspicious: false, reason: null };
}
