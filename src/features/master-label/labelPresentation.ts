import type { PrintReadiness } from './marketProfiles';

/** Presentation-only cleanup. Persisted run identity remains unchanged. */
export const lotCodeForDisplay = (lotCode: string): string => lotCode.replace(/^LOT-/, '');

/**
 * DISPLAY MAP ONLY — Polish wording for the `PrintReadiness` contract enum.
 * The raw value stays exactly as the preflight/label repository produced it
 * (`labelRepository` still gates on `printReadiness === 'NOT_READY'`); only the
 * chip the operator reads is localized. An unknown future member falls back to
 * the raw value rather than rendering blank.
 */
export const printReadinessLabelPl = (readiness: PrintReadiness | string): string => {
  switch (readiness) {
    case 'NOT_READY':
      return 'Niegotowe do druku';
    case 'PRINT_READY_UNIVERSAL':
      return 'Gotowe — etykieta uniwersalna';
    case 'PRINT_READY_REGULATORY':
      return 'Gotowe — profil prawny rynku';
    default:
      return readiness;
  }
};
