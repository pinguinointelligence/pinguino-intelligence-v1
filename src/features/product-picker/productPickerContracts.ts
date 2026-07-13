/**
 * PINGÜINO Product Picker — shared contracts (pure).
 *
 * The picker turns a customer's tap on a GENERIC requirement line ("Czekolada",
 * "Whisky", "Malina") into a concrete product chosen from the CANONICAL products
 * layer. It never invents a product: every entry mirrors the real `public.products`
 * schema (`ProductRow`) and every engine-readiness verdict is delegated to the
 * reused Ingredient-Resolution gate (`evaluateProductReadiness`), which itself
 * composes `resolveProductEngineValues` + `decideProductStatus`.
 *
 * Boundaries (studio-boundary safe):
 *  - no engine imports, no engine math — readiness is delegated;
 *  - no PAC/POD is invented; unknown stays null;
 *  - the picker is a READ surface — it never writes a product, never grants
 *    PI Verified, never mutates a status;
 *  - the concrete catalogue rows come from an injected `ProductCatalogPort`
 *    (backend catalogue adapter, or the honest in-memory sample) — never hard-typed into a
 *    React component.
 */
import type { ReadinessProductInput } from '@/features/ingredient-resolution';
import type { ReferenceEngineValues } from '@/data/products/productEngineResolver';
import type { ProductStatus } from '@/data/products/productRow';

/**
 * One catalogue entry the picker can display and resolve. The `readiness` +
 * `reference` fields are exactly what the reused readiness gate consumes, so a
 * picked entry flows straight into `pickProduct` without re-deriving anything.
 */
export interface PickerCatalogueEntry {
  /** Stable product id attached to the recipe line on selection. */
  productId: string;
  /** The DB `product_code` (human id), shown/searchable when present. */
  productCode: string | null;
  displayName: string;
  internalName: string | null;
  brand: string | null;
  ean: string | null;
  category: string | null;
  packageSize: string | null;
  imageUrl: string | null;
  /** Lifecycle status (drives the readable Polish status label — never shown raw). */
  status: ProductStatus;
  /** The subset of fields the engine-readiness gate reads (engine values + red-flag text). */
  readiness: ReadinessProductInput;
  /** The matched `mapper_basement` reference looked up by the caller, or null. */
  reference: ReferenceEngineValues | null;
}

/** A customer's search over the catalogue. `text` matches many fields; `category` narrows. */
export interface ProductSearchQuery {
  text: string;
  category?: string | null;
}

/** Why a candidate matched a query (honest, enumerable — no fabricated %). */
export type PickerMatchedOn =
  | 'product_id'
  | 'ean'
  | 'exact_name'
  | 'brand'
  | 'name_contains'
  | 'category';

/** A readable readiness verdict for one candidate (customer-facing, Polish). */
export interface PickerReadiness {
  /** true ONLY when engine values resolve AND no red flag blocks the product. */
  exactReady: boolean;
  /** Short Polish badge, e.g. "Gotowy do przeliczenia" / "Wymaga danych". */
  badge: string;
  /** The single honest not-ready message when blocked, else null. */
  message: string | null;
  /** true when values are reference-linked (not an independent measurement). */
  referenceLinked: boolean;
}

/** One search result: the entry plus its computed readiness + readable status. */
export interface ProductPickResult {
  entry: PickerCatalogueEntry;
  matchedOn: PickerMatchedOn;
  readiness: PickerReadiness;
  /** Readable Polish lifecycle label (never the raw enum), or null when internal-only. */
  statusLabel: string | null;
}

/**
 * The catalogue source the picker reads. Implemented by the backend catalogue adapter
 * (against the real schema) and by the honest in-memory sample. Async so a real
 * backend fits; the in-memory adapter resolves immediately.
 */
export interface ProductCatalogPort {
  /** All entries relevant to a query (the pure ranker refines + orders them). */
  fetch(query: ProductSearchQuery): Promise<PickerCatalogueEntry[]>;
}

/** How the currently-connected catalogue should be described to the customer. */
export interface CatalogueSource {
  /** `sample` = honest built-in reference set (NOT the production catalogue);
   *  `live` = an approved, connected products environment. */
  kind: 'sample' | 'live';
  /** Honest Polish note shown above the picker results. */
  note: string;
}
