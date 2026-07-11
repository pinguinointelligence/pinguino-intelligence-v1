/**
 * OCR label-intake copy (English — matches the existing intake / dev-tool surfaces).
 *
 * ALL user-facing strings for the OCR intake feature live here (never in src/copy/en.ts,
 * which is owned by another slice). Pure data, no logic.
 */

export const ocrCopy = {
  page: {
    devTag: 'DEV · internal',
    title: 'Label OCR intake',
    intro:
      'Read a food-label photo with the LOCAL OCR engine (keyless, in-browser WASM — the image never leaves this machine), review every extracted field, then confirm to build a local product draft. Nothing is saved automatically.',
    privacyNote:
      'Local processing: recognition runs inside this browser tab. Only the OCR engine assets (worker script, WASM core, language models eng+spa) are fetched from their pinned CDN URLs on first use — the label image itself is never uploaded anywhere.',
  },
  input: {
    chooseImage: 'Choose a label image',
    accepted: 'Accepted: PNG, JPEG, WebP',
    rejectedType: 'Not a supported label image — use PNG, JPEG or WebP.',
    tooLarge: 'Image is too large',
    runOcr: 'Run OCR',
    cancel: 'Cancel',
    running: 'Reading label…',
    retry: 'Retry',
  },
  failure: {
    unreadable:
      'The engine could not read usable text from this image. Try a sharper, well-lit, straight-on photo of the label.',
    cancelled: 'OCR cancelled — nothing was extracted.',
    engineError: 'The OCR engine failed to run.',
  },
  review: {
    title: 'Review extracted fields',
    rawTextTitle: 'Raw OCR text',
    imageTitle: 'Original image',
    confidence: 'OCR confidence',
    bandHigh: 'high',
    bandMedium: 'medium',
    bandLow: 'low',
    bandUnknown: 'n/a',
    needsConfirmation: 'needs manual confirmation',
    confirm: 'Confirm',
    confirmed: 'confirmed',
    notFound: 'not found on label',
    globalWarningsTitle: 'Warnings / ambiguities',
    basisLabel: 'Nutrition basis',
    languageLabel: 'Language hint',
  },
  fields: {
    productName: 'Product name',
    brand: 'Brand',
    eanCode: 'EAN / barcode',
    netQuantity: 'Net quantity',
    energyKj: 'Energy (kJ)',
    energyKcal: 'Energy (kcal)',
    fat: 'Fat (g)',
    saturatedFat: 'of which saturates (g)',
    carbohydrates: 'Carbohydrates (g)',
    sugars: 'of which sugars (g)',
    protein: 'Protein (g)',
    salt: 'Salt (g)',
    ingredientsText: 'Ingredients',
    allergens: 'Allergens / contains',
    mayContain: 'May contain',
    storageInstructions: 'Storage instructions',
  },
  basis: {
    per_100g: 'per 100 g',
    per_100ml: 'per 100 ml',
    serving_only: 'per serving only',
    unknown: 'unknown',
  },
  handoff: {
    buildDraft: 'Confirm review → build local draft',
    blocked: 'Confirm every flagged field before building the draft.',
    draftTitle: 'Local product intake draft (NOT saved)',
    draftNote:
      'This is the existing local product-intake draft object (same contract as the table import). It is shown here only — no database write, no automatic save. Saving goes through the existing reviewed import path.',
  },
} as const;
