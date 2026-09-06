# SCAN CORE ↔ SCAN IMPORT — proposed boundary (paper only; nothing wired)

## Current truth (staging e2e1a61a)
- Scan Core (`src/scan-core`, `src/scan-lab`) exists only on `claude/scan-core-phase-0`. Nothing on staging imports it: **coupling NONE**.
- The de-facto Scan Import input today is a bare digit string: `validateBarcode(value, hintedFormat) → ValidBarcode { value, format, lookupValue }` on the client (`product-scanner/barcode.ts`), `evidence.barcode: string` in `product-identify-live`, `barcode: ValidBarcode` in `product-scan-analyze` mode `ean_lookup`. No confirmation state, no evidence, no timestamps cross that line.
- Name collision to resolve first: the live scanner already exports a `ScanObservation` (`product-scanner/liveScanSession.ts`: `{ at, quality, barcode?, barcodeValidated?, catalogResolved?, identityKey?, label?, route, confidence?, corroboratedByText? }`) and Scan Core exports its own `ScanObservation` (`scan-core/observation.ts`: `{ trackId, kind:'barcode', state, barcode: BarcodeEvidenceSummary, bestFrames, timing, reasons }`). One of them must be renamed before any adapter exists (proposal: Scan Core's becomes `ConfirmedScan`, the live scanner's stays).

## Smallest compatible contract
**Scan Core output — `ConfirmedScan` (repo-native fields, all already produced by `scan-core/engine.ts`):**
```ts
interface ConfirmedScan {
  symbology: 'EAN-13' | 'EAN-8' | 'UPC-A' | 'UPC-E';   // scan-core BarcodeFormat minus 'unknown' — never inferred from digit count
  value: string;                                        // normalised digits (checksum-valid)
  rawValue?: string;                                    // decoder text before normalisation
  confirmation: { lane: 'fast' | 'consensus'; agreeingFrames: number; sources: ('native'|'medium'|'rescue'|'rectified')[] };
  evidence: { moduleNative: number | null; fill: number | null; mixedFormats: boolean };
  timing: { firstSeenAt: number; completedAt: number };
  provenance: { trackId: string; harnessBuild: string };  // diagnostic only
}
```
NO product data, NO frames. `ScanNone { reason }` stays inside Scan Core (guidance), it never reaches Scan Import.

**Scan Import input:** exactly one `ConfirmedScan`. The adapter's only job is `ConfirmedScan → ValidBarcode`: `validateBarcode(value, symbology)` must accept the Scan Core symbology string (today it only distinguishes UPC-E; extend the hint mapping) and must REJECT if its own check-digit result disagrees with `value` (defence in depth). `rawValue`, `confirmation` and `evidence` are passed through as scan-session diagnostics (`product_scan_sessions` gains a `scan_core_json` column or the existing `validation_json` carries them) — they are evidence for the customer-facing "how sure" line and for support, never for identity.

**Scan Import output — `ImportResolution` (built from repo-native results):**
```ts
type ImportResolution =
  | { kind: 'existing_product'; product: ScanExactProduct; exactness: 'exact_gtin'; provenance: 'catalog'; confidence: 97 }
  | { kind: 'ambiguous'; candidates: ScanExactProduct[] }                       // NEW state (F4.3)
  | { kind: 'unresolved'; next: 'ean_lookup' | 'analyze_label' | 'request_evidence' | 'estimate' }  // routeScan kinds
  | { kind: 'needs_confirmation'; reason: 'family' | 'missing_critical_fields'; missing: string[] }
  | { kind: 'imported'; productId: string; productCode: string | null; engineUsable: boolean; overlayState: ProductScanOverlayState; confidence: number }
  | { kind: 'failed'; code: ScannerErrorCode };
```
NO camera processing, NO frames.

## What would have to change (compatibility gaps, for the later fix plan)
1. Rename one `ScanObservation` (collision).
2. `validateBarcode` hint mapping: accept `'EAN-13' | 'EAN-8' | 'UPC-A' | 'UPC-E'` and cross-check the value.
3. Server: `normalizeValidatedBarcode` must accept a symbology and stop inferring UPC-E/EAN-8 by length (§2).
4. Add the `ambiguous` outcome to `product-identify-live` (return the rows instead of `null`) and to `lookupExactBarcode` (never `rows.find` over a ranked list when more than one row matches).
5. Persist the Scan Core confirmation summary on the scan session (diagnostic column) so a wrong import can be traced to a weak confirmation.
Nothing above is implemented; this file is the boundary proposal only.
