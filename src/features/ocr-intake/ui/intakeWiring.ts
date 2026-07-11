/**
 * REAL intake wiring — assembles the merged OCR modules into the page's
 * `IntakeWiring` seam (orchestrator integration of tracks G + H).
 *
 * What is REAL here:
 *   • runOcr → the tesseract provider (the SAME in-browser WASM engine the quick
 *     path proves against real images; no mock, no fixture fallback);
 *   • extractEvidence → the deterministic evidence extractor (all 28 field keys);
 *   • assessDuplicate → the real duplicate logic (H) run over a caller-supplied
 *     product list via the real `buildSessionCandidate` → `mapRowToProductInsert`.
 *
 * `reduceSession` stays null on the dev page: the multi-image STATE mechanics use
 * the deterministic in-memory demo reducer (contract-shaped), because the real
 * reducer's add/replace paths require a server-computed SHA-256 checksum and the
 * save path requires the (launch-gated) intake backend + storage — reached, like
 * all persistence, only through `@/services/**`, never from this UI layer. H's real
 * reducer, saveFlow and batch are unit-proven and are what production wiring
 * consumes once the intake backend is live. This factory is that production seam.
 */
import { extractEvidence, type EvidenceSource } from '../evidenceExtractor';
import { TesseractOcrProvider } from '../provider/tesseractProvider';
import { assessDuplicate as assessDuplicatePure, type ExistingProductForDedup } from '../session/duplicateCheck';
import { buildSessionCandidate } from '../session/saveFlow';
import type { IntakeImage, ProductIntakeSession, RawOcrResult, ReviewedField } from '../intakeContracts';
import type { IntakeWiring } from '@/pages/dev/OcrIntakePage';

/**
 * Map raw OCR runs + their images to evidence sources (the extractor needs the
 * image role per run). Runs with no matching image default to role 'other'.
 */
export function toEvidenceSources(
  runs: readonly RawOcrResult[],
  images: readonly IntakeImage[],
): EvidenceSource[] {
  return runs.map((result) => {
    const image = images.find((i) => i.imageId === result.imageId);
    return { imageId: result.imageId, role: image?.role ?? 'other', result };
  });
}

export interface RealWiringOptions {
  /** Existing products to dedup against (caller-fetched; [] in an empty catalog). */
  existingProducts?: readonly ExistingProductForDedup[];
}

/**
 * Build a real `IntakeWiring`. `runOcr`/`extractEvidence`/`assessDuplicate` are the
 * merged production modules; `reduceSession` stays null (demo mechanics on the dev
 * page — see the file header).
 */
export function buildRealIntakeWiring(options: RealWiringOptions = {}): IntakeWiring {
  const provider = new TesseractOcrProvider();
  const existing = options.existingProducts ?? [];

  return {
    runOcr: (input) => provider.recognize(input),
    extractEvidence: (runs: RawOcrResult[]): ReviewedField[] =>
      extractEvidence(toEvidenceSources(runs, [])),
    reduceSession: null,
    assessDuplicate: (session: ProductIntakeSession) => {
      const { candidate } = buildSessionCandidate(session);
      return Promise.resolve(
        assessDuplicatePure({ insert: candidate.insert, manualEan: session.manualEan }, existing),
      );
    },
  };
}
