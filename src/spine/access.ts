/**
 * PINGUINO Spine — Account Access contract (Account_Access.md, locked v1.0).
 *
 * Pure capability types + level defaults. Recipe Intelligence never implements
 * sign-in or payment flows — it RECEIVES a resolved AccessContext from the
 * external account layer and applies capability gates. Capabilities change
 * visibility and allowed workflows only; they never change calculation truth.
 * Recipe modules read `capabilities` — never plan names.
 */
import type { SpineContractVersion } from './types';

export type AccessLevel = 'demo' | 'paid';

export interface AccessWarning {
  code: string;
  severity: 'info' | 'warning' | 'critical';
  messageKey: string;
}

/** The only thing Recipe Intelligence may use for access decisions. */
export interface AccessCapabilities {
  canStartUserFlow: boolean;

  canViewRecipeDirection: boolean;
  canViewTechnologyWarnings: boolean;

  canViewExactRecipeGrams: boolean;
  canViewExactCorrectionGrams: boolean;
  canViewExactBeforeAfterValues: boolean;

  canUseAutoFix: boolean;
  canApplyAutoFix: boolean;

  canSavePreferences: boolean;
  canSaveRecipeDrafts: boolean;
  canSaveFullRecipes: boolean;

  canUseActualBatchRescue: boolean;
  canUseStockShortageWorkflow: boolean;

  canUseProductionBatchMode: boolean;
  canViewExpertMetrics: boolean;
}

/** Resolved before any recipe output is rendered; provided by the external account layer. */
export interface AccessContext {
  userId: string | null;
  accountId?: string | null;

  accessLevel: AccessLevel;
  planId: string | null;
  planName?: string | null;

  capabilities: AccessCapabilities;

  isLoggedIn: boolean;
  isSubscriptionActive: boolean;

  source: 'anonymous_demo' | 'logged_demo' | 'paid_subscription' | 'admin_override';

  warnings: AccessWarning[];

  contractVersion: SpineContractVersion;
}

/**
 * Demo: same User Flow as paid, redacted production data. May see profile,
 * direction and warnings; may save preferences and redacted drafts. Never
 * exact grams, exact Auto Fix, exact before/after values, or production modes.
 */
export const DEMO_CAPABILITIES: AccessCapabilities = {
  canStartUserFlow: true,

  canViewRecipeDirection: true,
  canViewTechnologyWarnings: true,

  canViewExactRecipeGrams: false,
  canViewExactCorrectionGrams: false,
  canViewExactBeforeAfterValues: false,

  canUseAutoFix: false,
  canApplyAutoFix: false,

  canSavePreferences: true,
  canSaveRecipeDrafts: true,
  canSaveFullRecipes: false,

  canUseActualBatchRescue: false,
  canUseStockShortageWorkflow: false,

  canUseProductionBatchMode: false,
  canViewExpertMetrics: false,
};

/** Default paid capabilities; specific plans may narrow via capability gates. */
export const PAID_CAPABILITIES: AccessCapabilities = {
  canStartUserFlow: true,

  canViewRecipeDirection: true,
  canViewTechnologyWarnings: true,

  canViewExactRecipeGrams: true,
  canViewExactCorrectionGrams: true,
  canViewExactBeforeAfterValues: true,

  canUseAutoFix: true,
  canApplyAutoFix: true,

  canSavePreferences: true,
  canSaveRecipeDrafts: true,
  canSaveFullRecipes: true,

  canUseActualBatchRescue: true,
  canUseStockShortageWorkflow: true,

  canUseProductionBatchMode: true,
  canViewExpertMetrics: true,
};
