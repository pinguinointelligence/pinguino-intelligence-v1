/**
 * A bundle line is a PORTION, not a purchase of the retail bag.
 *
 * The SKU title is canonical for the SKU — „Dekstroza · 500 g" is correct on
 * the 500 g article's own card. Inside the Starter Pack, where 250 g is packed,
 * printing the title unchanged produced „Dekstroza · 500 g · 250 g": two pack
 * sizes on one line, which reads as a contradiction. The retail suffix comes
 * off in the presentation rather than out of the SKU.
 */
export const shopContentTitle = (title: string): string =>
  title.replace(/\s*\u00b7\s*[\d\u0020\u00a0\u202f]+g\s*$/u, '').trim();
