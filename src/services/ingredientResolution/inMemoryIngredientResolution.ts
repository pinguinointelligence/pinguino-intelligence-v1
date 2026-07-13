/**
 * In-memory Ingredient Resolution adapter — a thin, deterministic STATEFUL wrapper around the
 * pure `@/features/ingredient-resolution` reducers. It exists so the DEV harness (and unit
 * tests) can drive the whole flow without a live backend; a real persistence adapter would
 * implement the same surface once the backend is a live launch gate.
 *
 * It performs NO IO of its own — it just holds the current `IngredientResolutionState` and
 * applies the pure reducers. All Engine-readiness / honesty guarantees live in the pure core.
 */
import {
  beginIntake,
  cancelIntake,
  closeSheet,
  completeIntakeReturn,
  createResolutionState,
  createResolutionWorkingCopy,
  ingredientResolutionSummary,
  openSheet,
  pickProduct,
  recordSubstitutionAction,
  resolutionForLine,
  searchCatalogue,
  selectForm,
  showAttachedCandidates,
  type CreateResolutionInput,
  type PickProductInput,
} from '@/features/ingredient-resolution';
import type {
  IngredientForm,
  IngredientResolutionState,
  IngredientResolutionSummary,
  LineResolution,
  ProductCandidate,
} from '@/features/ingredient-resolution';
import type { CatalogueProduct } from '@/features/ingredient-resolution';

export class InMemoryIngredientResolution {
  private state: IngredientResolutionState;

  private readonly catalogue: readonly CatalogueProduct[];

  constructor(seed: CreateResolutionInput, catalogue: readonly CatalogueProduct[] = []) {
    this.state = createResolutionState(seed);
    this.catalogue = catalogue;
  }

  /** Replace the whole state from a fresh working copy (never mutates a source recipe). */
  loadWorkingCopy(args: Parameters<typeof createResolutionWorkingCopy>[0]): void {
    this.state = createResolutionWorkingCopy(args);
  }

  snapshot(): IngredientResolutionState {
    return this.state;
  }

  summary(): IngredientResolutionSummary {
    return ingredientResolutionSummary(this.state);
  }

  line(lineId: string): LineResolution | undefined {
    return resolutionForLine(this.state, lineId);
  }

  open(lineId: string): void {
    this.state = openSheet(this.state, lineId);
  }

  close(): void {
    this.state = closeSheet(this.state);
  }

  chooseForm(lineId: string, form: IngredientForm): void {
    this.state = selectForm(this.state, lineId, form);
  }

  chooseCandidates(lineId: string, candidates: readonly ProductCandidate[]): void {
    this.state = showAttachedCandidates(this.state, lineId, candidates);
  }

  search(lineId: string, query: string): void {
    this.state = searchCatalogue(this.state, lineId, query, this.catalogue);
  }

  scan(lineId: string): void {
    this.state = beginIntake(this.state, lineId, 'scan');
  }

  addManually(lineId: string): void {
    this.state = beginIntake(this.state, lineId, 'manual');
  }

  cancelIntake(lineId: string): void {
    this.state = cancelIntake(this.state, lineId);
  }

  substitution(lineId: string, action: 'dont_have' | 'substitute' | 'why', requestedSubstituteName?: string): void {
    this.state = recordSubstitutionAction(this.state, lineId, action, requestedSubstituteName);
  }

  pick(lineId: string, input: PickProductInput): void {
    this.state = pickProduct(this.state, lineId, input);
  }

  /** Return from a successful OCR / manual intake save with the new Product ID. */
  returnFromIntake(lineId: string, input: PickProductInput): void {
    this.state = completeIntakeReturn(this.state, lineId, input);
  }
}
