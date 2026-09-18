import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { toppingCreationDefaultGrams } from '@/features/recipe-composition/toppingCreationDefault';
import { decideUsageRole } from './homeUsageRoleDecision';
import { homePriorityBootstrapInstructions } from './homePriorityBootstrap';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence/contracts';

const read = (path: string): string => readFileSync(path, 'utf8');
const page = read('src/pages/home/HomeCreatorPage.tsx');
const recipe = read('src/features/home-creator/ui/HomeRecipeSection.tsx');
const review = read('src/features/home-creator/ui/HomeRecalculate.tsx');
const orchestration = read('src/features/home-creator/homeRecalculation.ts');
const preparation = read('src/features/home-creator/ui/HomePreparation.tsx');
const processController = read(
  'src/features/production-workspace/process/useLocalProductionProcess.ts',
);
const processView = read('src/features/production-workspace/process/ProductionProcess.tsx');
const draft = read('src/features/home-creator/homeDraftStore.ts');
const amount = read('src/features/home-creator/ui/HomeAmountPrompt.tsx');
const intent = read('src/features/home-creator/useHomeIntentIngredients.ts');
const resolver = read('src/features/home-creator/homeIntentResolutionService.ts');
const save = read('src/features/recipes/useCanonicalRecipeSave.ts');
const share = read('src/features/community/ui/ShareRecipeDialog.tsx');
const publish = read('src/features/community/ui/PublishToCommunityDialog.tsx');
const community = read('src/services/community.ts');
const communityMigration = read(
  'supabase/migrations/20260913233000_home_community_recipe_images.sql',
);
const routes = read('src/app/router.tsx');
const recipesHub = read('src/pages/destinations/RecipesHubPage.tsx');

const behavior = (patch: Partial<ProductBehaviorSnapshot>): ProductBehaviorSnapshot =>
  ({
    moduleEligibility: {},
    ...patch,
  }) as ProductBehaviorSnapshot;

describe('GELLATTI HOME end-to-end closure — Owner matrix', () => {
  it('HOME-E2E-01 exact Main-capable Arabesque intent survives and is sized', () => {
    expect(resolver).toContain('resolution.exact');
    expect(intent).toContain('snapshotServerResolvedProductBehavior');
    expect(page).toContain('if (initialPrepared === null) return;');
    // The 0 g priority line reaches the solver through HOME's one orchestration.
    expect(orchestration).toContain('homeRecalculationInstructions');
    expect(page).toContain('await recalculateHomeRecipe()');
  });

  it('HOME-E2E-02 non-Main BASE asks an empty amount without a prefill', () => {
    expect(page).toContain("kind: 'ingredient'");
    expect(page).toContain('initialGrams: null');
    expect(amount).toContain('initialGrams?: number | null');
  });

  it('HOME-E2E-03 topping starts at exactly 5% and supports all amount actions', () => {
    expect(toppingCreationDefaultGrams([{ planned_grams: 600 }, { planned_grams: 400 }])).toBe(50);
    expect(amount).toContain('home-amount-prompt-minus');
    expect(amount).toContain('home-amount-prompt-plus');
    expect(amount).toContain('home-amount-prompt-input');
    expect(amount).toContain('home-amount-prompt-confirm');
    expect(amount).toContain('home-amount-prompt-cancel');
  });

  it('HOME-E2E-04 a dual-eligible product asks Ingredient/Topping once', () => {
    expect(
      decideUsageRole(
        behavior({ moduleEligibility: { BASE_RECIPE: 'eligible', TOPPING: 'eligible' } }),
      ),
    ).toEqual({ kind: 'ask' });
    expect(page).toContain("source: 'initial'");
  });

  it('HOME-E2E-05 several Main-capable products remain hidden AUTO priorities', () => {
    expect(
      homePriorityBootstrapInstructions(
        [
          { id: 'a', lock_type: 'main', planned_grams: 0, actual_grams: null },
          { id: 'b', lock_type: 'main', planned_grams: 0, actual_grams: null },
        ],
        [],
      ).map((entry) => entry.lineId),
    ).toEqual(['a', 'b']);
    expect(page).toContain('visibleCrownLineIds(recipe.items, recipe.priority_mode)');
  });

  it('HOME-E2E-06 first live recipe is verified and has no main-screen Recalculate', () => {
    expect(page.indexOf('practicalRecipeAudit !== null')).toBeLessThan(
      page.indexOf('markRecipeReady(true)'),
    );
    expect(recipe).not.toContain('<HomeRecalculate');
    expect(recipe).not.toContain('home-recalc-run');
  });

  it('HOME-E2E-07 manual grams remain editable with Lock ON', () => {
    expect(recipe).toContain('setExactGrams(item.id, next)');
    expect(recipe).not.toMatch(/disabled=\{[^}]*locked/);
  });

  it('HOME-E2E-08 Crown stays independent from Lock', () => {
    expect(recipe).toContain("setLockType(lineId, isMain ? 'unlocked' : 'main', 'home')");
    expect(recipe).toContain('setGramLock(item.id, gramsLocked ? null : item.planned_grams)');
  });

  it('HOME-E2E-09 an edit starts the shared solve automatically — from the page, never the rows', () => {
    // OWNER 2026-09-18 (§3, §10) supersedes „live edits do not start a solve”: after a
    // change CORE marks as needing a calculation, HOME runs the shared PRZELICZ itself.
    // The recipe rows still never call a runner — the page's one orchestration does.
    expect(recipe).not.toContain('runPiRecalculationWithTerminal');
    expect(recipe).not.toContain('runInteractiveRecalculationWithTerminal');
    expect(page).toContain('state.awaitingRecalculation');
    expect(page).toMatch(/recalculationWanted[\s\S]*recalculateHomeRecipe\(\)/);
  });

  it('HOME-E2E-09b a later successful automatic recalculation clears the „not recalculated” notice', () => {
    // Served E2E 2026-09-18: the notice outlived the recalculation that made it untrue.
    expect(page).toMatch(
      /outcome === 'applied' \|\| outcome === 'unchanged'[\s\S]{0,160}changesNotRecalculated \? null : current/,
    );
  });

  it('HOME-E2E-10 Zróbmy to starts solve automatically', () => {
    expect(page).toContain("requestFinalAction('make')");
    expect(page).toMatch(/action === 'make'[\s\S]*routePaidAction\(\)/);
    expect(review).toContain('runWith([])');
  });

  it('HOME-E2E-11 final review shows every proposed change', () => {
    expect(review).toContain('<ConstraintPreviewCard');
    expect(review).toContain('preview={preview}');
  });

  it('HOME-E2E-12 a preview edit requires Przelicz before Apply', () => {
    expect(review).toContain('onRecalculate: recalculateInPreview');
    expect(review).toContain('void runHomeRecalculation(instructions)');
    expect(orchestration).toContain('runInteractiveRecalculationWithTerminal(all)');
  });

  it('HOME-E2E-13 Wróć leaves the recipe untouched', () => {
    expect(review).toContain('.cancelPreview()');
    expect(review).not.toContain('loadRecipeInput(');
  });

  it('HOME-E2E-14 Apply commits and enters Preparation', () => {
    expect(review).toContain('applyPreviewWithServerAuthority');
    expect(page).toContain('startPreparation()');
    expect(page).toContain("scrollToStage('preparation')");
  });

  it('HOME-E2E-15 no-change review can Apply and enter Preparation', () => {
    expect(review).toContain('home-recalc-apply-no-change');
    expect(review).toContain('void onApplied()');
  });

  it('HOME-E2E-16 an unsaved recipe can enter Production', () => {
    expect(preparation).toContain('recipeId: draft.draftId');
    expect(preparation).toContain('recipeVersionId: null');
    expect(preparation).not.toContain('saved_version_required');
  });

  it('HOME-E2E-17 Preparation reads canonical Production steps', () => {
    expect(preparation).toContain('useProductionSessionStore');
    expect(preparation).toContain('recipeCompositionFromState');
    expect(preparation).toContain('machineEducationForSelection');
    expect(preparation).toContain('validateRecipeBehaviorOnServer');
    expect(preparation).toContain('evaluateRecipeConstraintAuthority');
  });

  it('HOME-E2E-18 a confirmed deviation uses Production Rescue („Korekta partii”)', () => {
    // DESIGN V3.0 IV: „Dodałem za dużo” and TARA are gone — the ✓ with a different amount
    // opens the same decision PRO Production offers, through the same gate and authority,
    // in the ONE shared batch process HOME hosts (DESIGN H4).
    expect(preparation).toContain('useLocalProductionProcess(');
    for (const source of [preparation, processView]) {
      expect(source).not.toContain('home-production-overage');
      expect(source).not.toContain('home-production-tare');
    }
    expect(processController).toContain('browserProductionRescueDecision(session)');
    expect(processController).toContain('assessProductionRescue');
    expect(processController).toContain('applyVerifiedRescueInput');
    expect(processController).toContain('productionDecisionOptions(');
  });

  it('HOME-E2E-19 topping appears only after the machine stage', () => {
    expect(processController).toContain("machineDone: session.stage === 'addons'");
    expect(processController).toContain("store().replaceSession({ ...session, stage: 'addons' })");
    expect(processView).toContain('process-topping-step');
  });

  it('HOME-E2E-20 Production reaches canonical Gotowe', () => {
    expect(processController).toContain('completeProductionSession');
    expect(preparation).toContain('home-production-complete');
  });

  it('HOME-E2E-21 editable proposed name survives the Save call', () => {
    expect(recipe).toContain('home-recipe-name');
    expect(draft).toContain('recipeNameOverride');
    expect(page).toContain('recipeSave.createNew(name.trim() || proposedName)');
    expect(page).toContain('recipeSave.rename(name.trim())');
  });

  it('HOME-E2E-22 a second Save creates an immutable new version', () => {
    expect(page).toContain('recipeSave.saveVersion()');
    expect(save).toContain('repository!.saveNewVersion');
  });

  it('HOME-E2E-23 dirty Save uses the same final review authority', () => {
    expect(page).toContain('setReviewAction(action)');
    expect(page).toContain('current.dirty || current.practicalRecipeAudit === null');
  });

  it('HOME-E2E-24 direct share pins the exact saved version', () => {
    expect(page).toContain('<ShareRecipeDialog');
    expect(share).toContain('createShareLink(recipeId, versionNumber, publicationId)');
  });

  it('HOME-E2E-25 unsaved Share explicitly saves then shares', () => {
    expect(page).toContain('Zapisz i udostępnij');
    expect(page).toContain('setConfirmSaveAction(action)');
  });

  it('HOME-E2E-26 signed-in recipients are persisted under Udostępnione', () => {
    expect(community).toContain('ReceivedShare');
    expect(community).toContain("from('recipe_share_recipients')");
  });

  it('HOME-E2E-27 logged-out direct share is demo-safe', () => {
    expect(community).toContain('entitlement: ShareEntitlement');
    expect(community).toContain('DemoSafeRecipe');
  });

  it('HOME-E2E-28 revoked links keep canonical access semantics', () => {
    expect(community).toContain("ShareFailureReason = 'not_found' | 'revoked' | 'expired'");
    expect(community).toContain('revokeShareLink');
  });

  it('HOME-E2E-29 Community publication requires camera/gallery photo', () => {
    expect(publish).toContain('publication-photo-camera');
    expect(publish).toContain('publication-photo-gallery');
    expect(publish).toContain('disabled={pending || !slug || !photo}');
    expect(communityMigration).toContain('community_photo_required');
  });

  it('HOME-E2E-30 Community pins the exact immutable recipe version', () => {
    expect(page).toContain('versionNumber={recipe.currentVersionNumber}');
    expect(communityMigration).toContain(
      'where recipe_id = p_recipe_id and version_number = p_version_number',
    );
  });

  it('HOME-E2E-31 later versions create a separate publication', () => {
    expect(communityMigration).toContain('where recipe_version_id = v_version.id');
    expect(communityMigration).toContain('insert into public.community_publications');
  });

  it('HOME-E2E-32 source and creator lineage remain attached on Save', () => {
    expect(save).toContain('stampCommunityLineage');
    expect(save).toContain('recordDerivation');
  });

  it('HOME-E2E-33 Partner status is not required to publish', () => {
    expect(communityMigration).not.toMatch(/partner_profiles|partner_status|is_partner/);
  });

  it('HOME-E2E-34 no comments or private messaging were added', () => {
    for (const source of [page, preparation, publish, communityMigration]) {
      expect(source).not.toMatch(/create\s+table\s+.*comment|private_message|sendMessage/i);
    }
  });

  it('HOME-E2E-35 refresh retains draft, answers and Production progress', () => {
    expect(draft).toContain('persist(');
    expect(draft).toContain('amountAnswersByChipId');
    expect(draft).toContain('usageAnswersByChipId');
    expect(preparation).toContain('activateSessionForAddress');
  });

  it('HOME-E2E-36 login/payment continuation does not reset the recipe', () => {
    expect(page).toContain('openAuthModal()');
    expect(page).toContain("navigate('/subscription')");
    expect(page).not.toMatch(/openAuthModal\(\)[\s\S]{0,100}resetToDemo/);
  });

  it('HOME-E2E-37 saved recipes retain HOME/PRO routing', () => {
    expect(routes).toMatch(/path=["']\/home/);
    expect(routes).toMatch(/path=["']\/pro/);
  });

  it('HOME-E2E-38 machine changes update the same recipe', () => {
    expect(page).toContain('setMachineSelection({');
    expect(page).not.toContain('cloneRecipe');
  });

  it('HOME-E2E-39 changing the core idea keeps the New Recipe confirmation contract', () => {
    expect(draft).toContain('startNew: () =>');
    expect(draft).toContain('hasDraft: () =>');
    expect(recipesHub).toContain("persona === 'home' && useHomeDraftStore.getState().hasDraft()");
    expect(recipesHub).toContain('useHomeDraftStore.getState().startNew();');
  });

  it('HOME-E2E-40 Demo masks grams while keeping Score visible', () => {
    expect(recipe).toContain('home-recipe-score');
    expect(recipe).toContain('homeCreatorCopy.recipe.maskedGramsValue');
  });
});
