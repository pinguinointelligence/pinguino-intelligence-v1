/**
 * Produkcja — the last address of every section (package PRODUKCJA V3, Etap 1 §1.4).
 *
 * Moving between sections returns to the place the customer left: a Produkty search with its
 * filter and product, a label version, a history view. The memory is deliberately small:
 *
 *   - IN MEMORY ONLY. Nothing is written to storage, so a reload starts the sections fresh and
 *     no second copy of a URL can drift from the router.
 *   - PER ACCOUNT. An address remembered for one account is never offered to another: a
 *     different owner reads as empty, and `clearAccountScopedClientState` wipes it on every
 *     account boundary (`src/app/accountSessionReset.ts`).
 *   - ADDRESSES, NOT STATE. Only `pathname + search` is kept. Router state (a label return
 *     route, a restore position) belongs to the navigation that created it.
 */
import { productionAreaSection, type ProductionAreaSectionId } from './productionAreaSections';

interface ProductionAreaMemory {
  ownerKey: string | null;
  lastBySection: Partial<Record<ProductionAreaSectionId, string>>;
}

let memory: ProductionAreaMemory = { ownerKey: null, lastBySection: {} };

const ownerKeyOf = (ownerUserId: string | null | undefined): string => ownerUserId ?? '';

/** Record the address the customer is on now, for the section it belongs to. */
export function rememberProductionAreaAddress(
  ownerUserId: string | null | undefined,
  sectionId: ProductionAreaSectionId,
  address: string,
): void {
  const ownerKey = ownerKeyOf(ownerUserId);
  if (memory.ownerKey !== ownerKey) memory = { ownerKey, lastBySection: {} };
  memory.lastBySection = { ...memory.lastBySection, [sectionId]: address };
}

/** Where the bar sends the customer for a section: the last address, else the section itself. */
export function productionAreaSectionAddress(
  ownerUserId: string | null | undefined,
  sectionId: ProductionAreaSectionId,
): string {
  const fallback = productionAreaSection(sectionId).to;
  if (memory.ownerKey !== ownerKeyOf(ownerUserId)) return fallback;
  return memory.lastBySection[sectionId] ?? fallback;
}

/** Forget every remembered address — called on an account boundary and by tests. */
export function clearProductionAreaMemory(): void {
  memory = { ownerKey: null, lastBySection: {} };
}
