/**
 * Server-side exact-GTIN confirmation — re-exported for the Edge runtime from the single canonical
 * implementation. Keeping one file means the rule that decides whether a page proves its identity
 * cannot start differing between the function that applies it and the tests that hold it.
 */
export * from '../../../src/features/product-intelligence/pageEanConfirmation.ts';
