/**
 * LIVE SCANNER — recognition orchestration.
 *
 * The layer between the camera and the session. It answers one question per frame:
 * "what is this, and does Gellatti actually know it?" — and nothing else. It holds no
 * React state, opens no camera and knows no UI; every capability is injected, so the
 * whole ladder is testable without a browser or a network.
 *
 * IDENTIFICATION FIRST. The expensive part of the existing Scanner is PROFILING —
 * nutrition, ingredients, allergens, the evidence gate. None of that runs here. A live
 * sweep only needs to know WHICH product is in front of the lens; profiling stays in the
 * existing deep flow and is handed the few products that genuinely need it.
 *
 * The ladder is strictly cheapest-first, and at most ONE rung is attempted per frame:
 *
 *   1. LOCAL_BARCODE   local decode, no network, no cost — tried on every usable frame
 *   2. CATALOG_MATCH   resolve what was read against the catalogue (one call per identity)
 *   3. LOCAL_OCR       local label text, when no barcode is visible
 *   4. VISION_FALLBACK paid recognition — throttled AND hard-capped, for produce and
 *                      packaging with no readable code
 *
 * COST. Every resolution is memoised per identity, including MISSES: an EAN the catalogue
 * does not know is looked up once and then answered from memory, so holding an unknown
 * product in view costs one call, not one per frame. Vision is additionally rate-limited
 * and capped, and only one resolution is ever in flight.
 */
import type { ValidBarcode } from './barcode';
import type { BarcodeImageSource } from './barcodeDecoder';
import type { FrameQuality } from './frameQuality';
import type { ScanObservation, ScanRoute } from './liveScanSession';

/** What the catalogue returned. `null` from a resolver means "not ours". */
export interface CatalogHit {
  readonly id: string;
  readonly displayName: string;
  readonly brand?: string | null;
}

export interface ObjectGuess {
  /** A stable key for the guessed thing, e.g. `vision:banana`. */
  readonly identityKey: string;
  readonly label: string;
  readonly confidence: number;
}

/**
 * Everything the orchestrator needs from the outside world. Each one is an EXISTING
 * authority in production code — none of them is reimplemented here.
 */
export interface RecognitionCapabilities {
  /** Local decode. `getSharedBarcodeDecoder()` in the app. */
  decodeBarcode(source: BarcodeImageSource): Promise<ValidBarcode | null>;
  /** Exact SKU resolution. `lookupExactBarcode` in the app. */
  resolveBarcode(barcode: ValidBarcode): Promise<CatalogHit | null>;
  /** Local label text. Optional: without it the ladder simply skips the rung. */
  readLabelText?(source: BarcodeImageSource): Promise<string | null>;
  /** Catalogue search by name — used by both the OCR and the vision rungs. */
  resolveName?(text: string): Promise<CatalogHit | null>;
  /** Paid recognition. Optional, throttled and capped. */
  recognizeObject?(source: BarcodeImageSource): Promise<ObjectGuess | null>;
}

/** Paid recognition is never fired faster than this, however fast frames arrive. */
export const VISION_MIN_INTERVAL_MS = 1_200;
/** A hard ceiling for one session, so a long sweep cannot run up a bill. */
export const VISION_MAX_CALLS = 12;
/**
 * Local OCR is free of NETWORK cost but expensive in CPU: the in-browser WASM engine
 * takes on the order of a second per frame on a phone. So it is not a per-frame rung —
 * it runs only when a barcode has failed to appear for a while, which is exactly the
 * case it exists for.
 */
export const OCR_MIN_INTERVAL_MS = 1_500;

/** Which rung to attempt for this frame. Pure, so the ladder is testable on its own. */
export type RecognitionAttempt = 'BARCODE' | 'OCR' | 'VISION' | 'NONE';

export interface LadderInput {
  readonly at: number;
  readonly quality: FrameQuality;
  readonly busy: boolean;
  readonly hasOcr: boolean;
  readonly hasVision: boolean;
  readonly lastOcrAt: number | null;
  readonly lastVisionAt: number | null;
  readonly visionCalls: number;
}

/**
 * The cheapest rung this frame can afford.
 *
 * A barcode decode is local and fast, so it is always worth trying on a usable frame; the
 * paid rung has to earn its turn.
 */
export function nextRecognitionAttempt(input: LadderInput): RecognitionAttempt {
  if (!input.quality.acceptableForAutoCapture) return 'NONE';
  if (input.busy) return 'NONE';
  return 'BARCODE';
}

/** The rung to try when the frame carried no readable barcode. */
export function nextFallbackAttempt(input: LadderInput): RecognitionAttempt {
  if (
    input.hasOcr &&
    (input.lastOcrAt === null || input.at - input.lastOcrAt >= OCR_MIN_INTERVAL_MS)
  )
    return 'OCR';
  if (
    input.hasVision &&
    input.visionCalls < VISION_MAX_CALLS &&
    (input.lastVisionAt === null || input.at - input.lastVisionAt >= VISION_MIN_INTERVAL_MS)
  )
    return 'VISION';
  return 'NONE';
}

/** A frame that produced nothing to say. */
const silent = (
  at: number,
  quality: FrameQuality,
  route: ScanRoute = 'UNKNOWN',
): ScanObservation => ({
  at,
  quality,
  route,
  identityKey: null,
});

export interface RecognitionCost {
  readonly catalogLookups: number;
  readonly visionCalls: number;
  readonly ocrReads: number;
  readonly barcodeDecodes: number;
}

/**
 * Turns frames into observations for `observeFrame`.
 *
 * Stateful only in the ways cost demands: what has already been resolved, what is in
 * flight, and what has been spent.
 */
export class LiveRecognizer {
  /** Resolutions already paid for. `null` records a MISS, which is just as valuable. */
  private readonly resolved = new Map<string, CatalogHit | null>();
  private busy = false;
  private lastOcrAt: number | null = null;
  private lastVisionAt: number | null = null;
  private cost: RecognitionCost = {
    catalogLookups: 0,
    visionCalls: 0,
    ocrReads: 0,
    barcodeDecodes: 0,
  };

  constructor(private readonly capabilities: RecognitionCapabilities) {}

  get spent(): RecognitionCost {
    return this.cost;
  }

  private spend(key: keyof RecognitionCost): void {
    this.cost = { ...this.cost, [key]: this.cost[key] + 1 };
  }

  /**
   * Resolve once, then answer from memory — including when the answer was "not ours".
   *
   * This is what stops an unknown product held in view from costing a lookup per frame.
   */
  private async resolveOnce(
    key: string,
    resolve: () => Promise<CatalogHit | null>,
  ): Promise<CatalogHit | null> {
    const known = this.resolved.get(key);
    if (known !== undefined) return known;
    this.spend('catalogLookups');
    const hit = await resolve();
    this.resolved.set(key, hit);
    return hit;
  }

  /**
   * Identify one frame.
   *
   * Never throws: a decoder or network failure mid-sweep must not end the session, so a
   * failed rung is simply a frame that said nothing.
   */
  async observe(
    source: BarcodeImageSource,
    quality: FrameQuality,
    at: number,
  ): Promise<ScanObservation> {
    const ladder: LadderInput = {
      at,
      quality,
      busy: this.busy,
      hasOcr: typeof this.capabilities.readLabelText === 'function',
      hasVision: typeof this.capabilities.recognizeObject === 'function',
      lastOcrAt: this.lastOcrAt,
      lastVisionAt: this.lastVisionAt,
      visionCalls: this.cost.visionCalls,
    };
    if (nextRecognitionAttempt(ladder) === 'NONE') return silent(at, quality);

    this.busy = true;
    try {
      const barcode = await this.tryDecode(source);
      if (barcode) return await this.fromBarcode(barcode, quality, at);
      return await this.fromFallback(source, quality, at, ladder);
    } catch {
      // A rung that failed is not a scanning error the customer should ever see.
      return silent(at, quality);
    } finally {
      this.busy = false;
    }
  }

  private async tryDecode(source: BarcodeImageSource): Promise<ValidBarcode | null> {
    this.spend('barcodeDecodes');
    return await this.capabilities.decodeBarcode(source);
  }

  /**
   * A decoded barcode is an exact READING, not yet a product.
   *
   * OWNER RULE. Green requires the whole chain — valid decode, then an exact catalogue
   * resolution. When the catalogue does not know the code, the reading is still carried
   * forward (the customer did scan something real), but as an unresolved identity that
   * the session will hand to the existing contribution flow. It is never named.
   */
  private async fromBarcode(
    barcode: ValidBarcode,
    quality: FrameQuality,
    at: number,
  ): Promise<ScanObservation> {
    const key = `ean:${barcode.lookupValue}`;
    const hit = await this.resolveOnce(key, () => this.capabilities.resolveBarcode(barcode));
    if (!hit) {
      return {
        at,
        quality,
        barcode: barcode.lookupValue,
        barcodeValidated: true,
        catalogResolved: false,
        identityKey: key,
        label: null,
        route: 'UNKNOWN',
      };
    }
    return {
      at,
      quality,
      barcode: barcode.lookupValue,
      barcodeValidated: true,
      catalogResolved: true,
      identityKey: hit.id,
      label: hit.displayName,
      route: 'LOCAL_BARCODE',
    };
  }

  private async fromFallback(
    source: BarcodeImageSource,
    quality: FrameQuality,
    at: number,
    ladder: LadderInput,
  ): Promise<ScanObservation> {
    const attempt = nextFallbackAttempt(ladder);

    if (attempt === 'OCR' && this.capabilities.readLabelText) {
      this.lastOcrAt = at;
      this.spend('ocrReads');
      const text = await this.capabilities.readLabelText(source);
      const named = text?.trim();
      if (named) {
        const hit = await this.resolveOnce(`text:${named.toLowerCase()}`, () =>
          this.capabilities.resolveName
            ? this.capabilities.resolveName(named)
            : Promise.resolve(null),
        );
        // Read text is weaker than a barcode, so it earns evidence rather than a lock:
        // the session still requires agreeing frames before anything turns green.
        if (hit)
          return {
            at,
            quality,
            catalogResolved: true,
            identityKey: hit.id,
            label: hit.displayName,
            route: 'LOCAL_OCR',
            confidence: 0.85,
          };
      }
      return silent(at, quality, 'LOCAL_OCR');
    }

    if (attempt === 'VISION' && this.capabilities.recognizeObject) {
      this.lastVisionAt = at;
      this.spend('visionCalls');
      const guess = await this.capabilities.recognizeObject(source);
      if (guess) {
        const hit = await this.resolveOnce(`vision:${guess.identityKey}`, () =>
          this.capabilities.resolveName
            ? this.capabilities.resolveName(guess.label)
            : Promise.resolve(null),
        );
        if (hit)
          return {
            at,
            quality,
            catalogResolved: true,
            identityKey: hit.id,
            label: hit.displayName,
            route: 'VISION_FALLBACK',
            confidence: guess.confidence,
          };
        // Recognised, but not something Gellatti stocks. Carried, never named.
        return {
          at,
          quality,
          catalogResolved: false,
          identityKey: `vision:${guess.identityKey}`,
          label: null,
          route: 'UNKNOWN',
          confidence: guess.confidence,
        };
      }
      return silent(at, quality, 'VISION_FALLBACK');
    }

    return silent(at, quality, 'CATALOG_MATCH');
  }
}
