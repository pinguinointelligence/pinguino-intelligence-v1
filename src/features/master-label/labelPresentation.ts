/** Presentation-only cleanup. Persisted run identity remains unchanged. */
export const lotCodeForDisplay = (lotCode: string): string => lotCode.replace(/^LOT-/, '');
