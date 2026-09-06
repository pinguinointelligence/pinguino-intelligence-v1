import type { RecipeInput } from '@/engine';
import { calculateFinalProduct } from '@/features/recipe-composition/finalProduct';
import type { RecipeCompositionMetadata } from '@/features/recipe-composition/recipeCompositionPersistence';
import {
  buildRecipeBehaviorAuthority,
  recipeBehaviorModuleGate,
  recipeInputFromFrozenBehavior,
  recipeToppingsFromFrozenBehavior,
} from '@/features/product-intelligence';
import type { AccountLabelProfile } from '@/services/labels/labelRepository';
import {
  applyAutoLabelLayout,
  buildLabelPreflight,
  buildRecipeDraftLabelData,
  type LabelPreflightItem,
  type MasterLabelData,
} from './masterLabel';
import { marketProfile } from './marketProfiles';
import type { RecipeLabelDraft } from './labelDraftPersistence';

export interface DraftLabelIngredient {
  readonly id: string;
  readonly name: string;
  readonly grams: number;
  readonly percent: number | null;
}

export type DraftLabelPendingId = LabelPreflightItem['field'];

export interface DraftLabelPreview {
  readonly kind: 'draft';
  readonly label: MasterLabelData;
  readonly productName: string | null;
  readonly ingredients: readonly DraftLabelIngredient[];
  readonly baseBatchG: number;
  readonly finalProductG: number;
  readonly plannedBatchG: number;
  readonly confirmedFields: readonly string[];
  readonly pending: readonly DraftLabelPendingId[];
  readonly blockers: readonly LabelPreflightItem[];
  readonly readyForPrint: boolean;
}

const primaryText = (value: Record<string, string>, languages: readonly string[]): string =>
  languages.map((language) => value[language]).find((text) => text?.trim()) ?? '';

/**
 * Current recipe facts always replace persisted derived facts. Editable label
 * choices survive reload/Save/Reopen, as do the draft-owned LOT and date.
 */
export function mergeRecipeDraftLabel(
  systemLabel: MasterLabelData,
  savedLabel: MasterLabelData | null,
  draft: RecipeLabelDraft,
): MasterLabelData {
  if (!savedLabel) return systemLabel;
  const productName = Object.values(savedLabel.productName).some((value) => value.trim())
    ? savedLabel.productName
    : systemLabel.productName;
  const userSelectedPackage =
    savedLabel.packageQuantity?.source !== 'planned_final_product'
      ? savedLabel.packageQuantity
      : systemLabel.packageQuantity;
  return applyAutoLabelLayout({
    ...systemLabel,
    ...savedLabel,
    masterLabelId: systemLabel.masterLabelId,
    sourceCompletionSessionId: systemLabel.sourceCompletionSessionId,
    sourceCompletedAt: systemLabel.sourceCompletedAt,
    sourceRecipeVersionId: systemLabel.sourceRecipeVersionId,
    sourceRecipeVersionNumber: systemLabel.sourceRecipeVersionNumber,
    sourceKind: 'recipe_draft',
    actualBatchQuantityG: systemLabel.actualBatchQuantityG,
    productName,
    ingredients: systemLabel.ingredients,
    allergens: draft.confirmedFields.includes('allergens')
      ? {
          ...systemLabel.allergens,
          status: 'complete',
          labelStatements: savedLabel.allergens.labelStatements,
          reviewedByUser: true,
        }
      : systemLabel.allergens,
    nutritionSource: systemLabel.nutritionSource,
    nutritionDeclaration: systemLabel.nutritionDeclaration,
    saturatedFatAuthority: systemLabel.saturatedFatAuthority,
    packageQuantity: userSelectedPackage,
    netQuantityG: userSelectedPackage?.netWeightG ?? null,
    productionDate: draft.productionDate,
    productionDateReviewed: true,
    lotCode: draft.lotCode,
  });
}

export function buildDraftLabelPreview({
  profile,
  recipeInput,
  composition,
  productName,
  draft,
  recipeVersionId = null,
  recipeVersionNumber = null,
}: {
  profile: AccountLabelProfile;
  recipeInput: RecipeInput;
  composition: RecipeCompositionMetadata;
  productName?: string | null;
  draft: RecipeLabelDraft;
  recipeVersionId?: string | null;
  recipeVersionNumber?: number | null;
}): DraftLabelPreview {
  const behaviorAuthority = buildRecipeBehaviorAuthority({
    items: recipeInput.items,
    toppings: composition.toppings,
    snapshots: composition.behaviorSnapshots ?? {},
  });
  const labelGate = recipeBehaviorModuleGate(behaviorAuthority, 'MASTER_LABEL');
  let factualInput = recipeInput;
  let factualToppings = composition.toppings;
  if (labelGate.ready) {
    factualInput = recipeInputFromFrozenBehavior(recipeInput, behaviorAuthority, 'nutrition');
    factualToppings = recipeToppingsFromFrozenBehavior(
      composition.toppings,
      behaviorAuthority,
      'nutrition',
    );
  }
  const finalProduct = calculateFinalProduct(factualInput, factualToppings, 'planning');
  const requiredLanguages = marketProfile(profile.market).requiredLanguages;
  const labelLanguages =
    profile.market === 'WORLD'
      ? profile.labelLanguages.length > 0
        ? profile.labelLanguages
        : ['en']
      : [...new Set([...requiredLanguages, ...profile.labelLanguages])];
  const systemLabel = applyAutoLabelLayout(
    buildRecipeDraftLabelData({
      masterLabelId: `master-label:${draft.draftId}`,
      draftId: draft.draftId,
      recipeName: productName?.trim() ?? '',
      recipeVersionId,
      recipeVersionNumber,
      productionDate: draft.productionDate,
      lotCode: draft.lotCode,
      recipeInput: factualInput,
      productComposition: { ...composition, toppings: factualToppings },
      finalProduct,
      market: profile.market,
      uiLanguage: profile.uiLanguage,
      labelLanguages,
      facilityDefaults: profile.facilityDefaults,
      shelfLifeAuthority: profile.shelfLifeAuthority,
      businessName: profile.businessName,
      logoPath: profile.logoPath,
      enabledOptionalFields: profile.enabledOptionalFields,
      presentation: {
        format: profile.presentation.format,
        size: {
          widthMm: profile.presentation.widthMm,
          heightMm: profile.presentation.heightMm,
        },
        copies: profile.presentation.copies,
      },
      printer: profile.presentation.printer,
    }),
  );
  const label = mergeRecipeDraftLabel(systemLabel, draft.label, draft);
  const preflight = buildLabelPreflight(label);
  const blockers = preflight.items.filter((item) => item.status !== 'ready');
  return {
    kind: 'draft',
    label,
    productName: primaryText(label.productName, label.labelLanguages) || null,
    ingredients: label.ingredients.map((item) => ({
      id: item.lineId,
      name: primaryText(item.names, label.labelLanguages),
      grams: item.actualGrams,
      percent: finalProduct.finalMassG > 0 ? item.percent : null,
    })),
    baseBatchG: finalProduct.baseMassG,
    finalProductG: finalProduct.finalMassG,
    plannedBatchG: finalProduct.finalMassG,
    confirmedFields: draft.confirmedFields,
    pending: blockers.map((item) => item.field),
    blockers,
    readyForPrint: preflight.readyForSystemPrint,
  };
}
