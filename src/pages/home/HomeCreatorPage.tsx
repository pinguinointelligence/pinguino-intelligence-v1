/**
 * GELLATTI HOME CREATOR — the public root (§9).
 *
 * ONE sequential page under the canonical `AppShell`, composing the stages the flow
 * says this particular user needs (§82–§84). It is an ORCHESTRATOR: every decision it
 * renders comes from a pure authority in `@/features/home-creator`, and every recipe
 * mutation goes through `recipeStore` — the same store PRO writes (§1, §14).
 *
 * §83: no dots, no `1/7` stepper, no separate navigation menu. Progress is the
 * document itself; a CTA scrolls to the next section and a subtle Back goes up.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EngineIngredient } from '@/engine';
import type { RecipeToppingIngredient } from '@/features/recipe-composition/recipeCompositionPersistence';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence/contracts';
import { productRecommendedDosagePl } from '@/features/product-intelligence/productDosageAuthority';
import { decideAddAmount } from '@/features/home-creator/homeAddAmountDecision';
import { HomeAmountPrompt } from '@/features/home-creator/ui/HomeAmountPrompt';
import { HomeUsagePrompt } from '@/features/home-creator/ui/HomeUsagePrompt';
import { decideUsageRole } from '@/features/home-creator/homeUsageRoleDecision';
import { useNavigate, useSearchParams } from 'react-router';
import { AppShell } from '@/features/shell/AppShell';
import { deriveMachineSetup, type HomeMachineProfile } from '@/features/machine-catalog';
import { machineDisplayName } from '@/features/machine-onboarding/machineViews';
import { useRecipeStore } from '@/stores/recipeStore';
import {
  DEFAULT_NEW_RECIPE_SERVING_MODE,
  DEFAULT_NEW_RECIPE_STRATEGY,
  starterServingModeForTemperature,
} from '@/features/recipes/newRecipeStarter';
import { homeCreatorCopy } from '@/features/home-creator/homeCreatorCopy';
import { homeCustomerNotice } from '@/features/home-creator/homeCustomerNotice';
import { useHomeDraftStore } from '@/features/home-creator/homeDraftStore';
import { queueAmountQuestion } from '@/features/home-creator/homeAmountQueue';
import { defaultHomeToppingGrams } from '@/features/home-creator/homeToppingDefault';
import { useCanSeeExactGrams } from '@/features/home-creator/useHomeEntitlement';
import { useHomeFlow } from '@/features/home-creator/useHomeFlow';
import { useHomeRecipeResult } from '@/features/home-creator/useHomeRecipeResult';
import {
  useHomeIntentIngredients,
  type IntentIngredientOutcome,
  type PreparedIntentIngredient,
} from '@/features/home-creator/useHomeIntentIngredients';
import { autoPriorityAppliesToNewLine, visibleCrownLineIds } from '@/features/recipe-priority';
import { useLegacyRecipeBehaviorRevalidation } from '@/features/product-intelligence';
import { ScanFlow } from '@/features/scan-flow/ScanFlow';
import { HomeMatchGate } from '@/features/home-creator/matching/HomeMatchGate';
import { useHomeIdeaSuggestions } from '@/features/home-creator/matching/useHomeIdeaSuggestions';
import { ideaFingerprint, markHomeTiming } from '@/features/home-creator/homeTimingMarks';
import { useIngredientLibrary } from '@/features/ingredient-builder/useIngredientLibrary';
import { useCanonicalRecipeSave } from '@/features/recipes/useCanonicalRecipeSave';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { useAuthStore } from '@/stores/authStore';
import { visibleProductTypeFor } from '@/features/home-creator/homeProfileMapping';
import { proposeRecipeName } from '@/features/home-creator/homeRecipeName';
import { buildHomeMachineView } from '@/features/home-creator/homeMachinePresentation';
import { presentLoadedRecipeInHome } from '@/features/home-creator/homeLoadedRecipe';
import {
  HomeRecipeOriginNotice,
  HomeRecipeProvenanceLine,
  HomeRecipeSources,
  type HomeOfficialAdoption,
} from '@/features/home-creator/ui/HomeRecipeOrigin';
import { officialRecipeCopy } from '@/copy/officialRecipeLibrary';
import { startNewProRecipe } from '@/pages/destinations/startNewProRecipe';
import {
  OfficialRecipeHandoffError,
  officialRecipeHandoffNotices,
  openOfficialRecipe,
} from '@/services/officialRecipeHandoff';
import {
  capacityGuidance,
  defaultHomeAmount,
  type HomeAmount,
} from '@/features/home-creator/homeAmountAuthority';
import {
  sweetnessValueForTap,
  tapChangesStoredValue,
  type HomeSweetness,
} from '@/features/home-creator/homeSweetness';
import type { HomeStage } from '@/features/home-creator/homeStageFlow';
import { resolveIdea } from '@/features/home-creator/homeIdeaResolution';
import { HomeIntentSection } from '@/features/home-creator/ui/HomeIntentSection';
import { HomeProfileSection } from '@/features/home-creator/ui/HomeProfileSection';
import { HomeMachineSection } from '@/features/home-creator/ui/HomeMachineSection';
import { HomeRecipeSection } from '@/features/home-creator/ui/HomeRecipeSection';
import { HomeRecalculate } from '@/features/home-creator/ui/HomeRecalculate';
import { HomePreparation } from '@/features/home-creator/ui/HomePreparation';
import { ShareRecipeDialog } from '@/features/community/ui/ShareRecipeDialog';
import { PublishToCommunityDialog } from '@/features/community/ui/PublishToCommunityDialog';
import { useCreatorProfile } from '@/features/community/useCreatorProfile';
import {
  applyPreviewWithServerAuthority,
  runInteractiveRecalculationWithTerminal,
  runPiRecalculationWithTerminal,
  useConstraintStudioStore,
} from '@/features/constraint-studio/constraintStudioStore';
import { homeRecalculationInstructions } from '@/features/home-creator/homePriorityBootstrap';

/** Smooth movement to the next section — the only "navigation" HOME has (§83). */
function useScrollToStage() {
  return useCallback((stage: HomeStage) => {
    if (typeof document === 'undefined') return;
    const element = document.getElementById(stage);
    element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
}

/** A product waiting for HOME's amount question. */
type PendingAdd = {
  chipId: string | null;
  ingredient: EngineIngredient;
  behavior: ProductBehaviorSnapshot | null;
  recommendedDose: string | null;
  kind: 'ingredient' | 'topping';
  initialGrams: number | null;
  source: 'initial' | 'live';
};

type HomeFinalAction = 'make' | 'save' | 'share' | 'community';

export function HomeCreatorPage() {
  // HOME authority closure (owner 2026-09-11): the same managed ProductBehavior
  // pass PRO runs. A product added here, the starter lines and chip lines get
  // usable BASE_RECIPE authority without a HOME recalculation — authority only,
  // never a full-recipe write, and a product the server refuses stays blocked.
  useLegacyRecipeBehaviorRevalidation();
  const canSeeGrams = useCanSeeExactGrams();
  const scrollToStage = useScrollToStage();

  const draft = useHomeDraftStore();
  const recipe = useRecipeStore();

  // A machine chosen for THIS recipe (§47: recipe-scoped, never the account default).
  const [machine, setMachine] = useState<HomeMachineProfile | null>(null);
  const [amount, setAmount] = useState<HomeAmount | null>(null);
  const [forceMachineStage, setForceMachineStage] = useState(false);
  const [resolving, setResolving] = useState(false);
  /** The idea text still in the composer: suggestions never open over a word being typed. */
  const [composerHasText, setComposerHasText] = useState(false);
  /** DESIGN V3.0 VIII — the card chosen on the suggestions layer, for ONE idea version. */
  const [suggestionChoice, setSuggestionChoice] = useState<{
    readonly signature: string;
    readonly id: string;
  } | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [recipeNotice, setRecipeNotice] = useState<string | null>(null);
  const intentIngredients = useHomeIntentIngredients();
  const [initialPrepared, setInitialPrepared] = useState<PreparedIntentIngredient[] | null>(null);
  const [initialBuilding, setInitialBuilding] = useState(false);
  const initialFinalizing = useRef(false);
  const lastGeneratedFor = useRef<string | null>(null);
  /** The products waiting for their confirmed amounts, asked one at a time
   * (Package 2A): each gets its own question. No line exists until it is answered. */
  const [pendingAdds, setPendingAdds] = useState<PendingAdd[]>([]);
  const pendingAdd = pendingAdds[0] ?? null;
  /** Queue a product for the amount question; `null` closes the current one. */
  const setPendingAdd = useCallback(
    (next: PendingAdd | null) => setPendingAdds((queue) => queueAmountQuestion(queue, next)),
    [],
  );
  /**
   * PACKAGE 2A — a BASE product that reached the recipe through the intent or scanner
   * door after the customer's first crown has no automatic amount, so the hook made no
   * line. Ask it with the same HOME question the picker path uses; the answer goes
   * through `addIngredientLine`, HOME's one Base-line door.
   */
  const askAmountFor = useCallback(
    (outcome: IntentIngredientOutcome) => {
      if (outcome.status !== 'needs_amount' || !outcome.ingredient) return;
      setPendingAdd({
        ingredient: outcome.ingredient,
        chipId: null,
        behavior: null,
        recommendedDose: null,
        kind: 'ingredient',
        initialGrams: null,
        source: 'live',
      });
    },
    [setPendingAdd],
  );
  // §56: the SAME library the Pro builder feeds its picker. Demo/free get the local
  // preview catalogue, an authenticated paid session gets live Mapper search — HOME
  // does not widen or narrow what Pro can see.
  const library = useIngredientLibrary({ demo: !canSeeGrams });
  // §65: THE ONE canonical save handler — create-vs-version and the immutable version
  // semantics are its job, not HOME's. Defaults build from the shared store and link
  // the draft, which is exactly what HOME edits.
  const recipeSave = useCanonicalRecipeSave();
  const openAuthModal = useAuthModalStore((state) => state.open);
  const navigate = useNavigate();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const authStatus = useAuthStore((state) => state.status);
  const hasCreatorProfile = useCreatorProfile(userId !== null);
  const [searchParams] = useSearchParams();
  const [reviewAction, setReviewAction] = useState<HomeFinalAction | null>(null);
  const [confirmSaveAction, setConfirmSaveAction] = useState<'share' | 'community' | null>(null);
  const [completionDialog, setCompletionDialog] = useState<'share' | 'community' | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  /**
   * An official Gellatti recipe opened in HOME — the library's „Zrób te lody", a match the
   * customer chose, or the §35 single match. One path: `openOfficialRecipe` materialises it and
   * adopts it as the customer's working copy (the original never changes); HOME then shows it
   * as its recipe. A refusal keeps the current draft and says why.
   */
  const [officialAdoption, setOfficialAdoption] = useState<HomeOfficialAdoption | null>(null);
  const adoptOfficialRecipe = useCallback(
    async (
      recipeId: string,
      options: { readonly keepIdea: boolean; readonly automatic: boolean },
    ) => {
      if (!userId) {
        openAuthModal();
        return;
      }
      setOfficialAdoption({ state: 'loading' });
      try {
        const materialized = await openOfficialRecipe(
          recipeId,
          userId,
          // Chosen from the customer's own idea: that choice IS their new recipe, exactly as a
          // generated one would be. A library handoff was confirmed on the library page.
          options.keepIdea ? { hasUnsavedChanges: () => false } : undefined,
        );
        presentLoadedRecipeInHome({
          label: materialized.recipe.name,
          officialRecipeId: recipeId,
          keepIdea: options.keepIdea,
        });
        setOfficialAdoption({
          state: 'ready',
          message: officialRecipeCopy.handoffReady(materialized.recipe.name),
          notices: officialRecipeHandoffNotices(materialized),
          automatic: options.automatic,
        });
        window.setTimeout(() => scrollToStage('recipe'), 60);
      } catch (error) {
        setOfficialAdoption({
          state: 'blocked',
          message:
            error instanceof OfficialRecipeHandoffError
              ? error.message
              : officialRecipeCopy.errors.generic,
        });
      }
    },
    [openAuthModal, scrollToStage, userId],
  );

  // The library's one-shot address: /home?source=official_recipe&officialRecipe=<id>.
  const officialHandoffId =
    searchParams.get('source') === 'official_recipe'
      ? searchParams.get('officialRecipe')?.trim() || null
      : null;
  const officialHandoffClaimed = useRef<string | null>(null);
  useEffect(() => {
    if (!officialHandoffId || authStatus === 'loading') return;
    if (!userId) {
      openAuthModal();
      return;
    }
    const key = `${userId}:${officialHandoffId}`;
    if (officialHandoffClaimed.current === key) return;
    officialHandoffClaimed.current = key;
    // Consume the address first: a reload must never rematerialise the pristine official
    // recipe over the customer's working copy.
    navigate('/home', { replace: true });
    void adoptOfficialRecipe(officialHandoffId, { keepIdea: false, automatic: false });
  }, [adoptOfficialRecipe, authStatus, navigate, officialHandoffId, openAuthModal, userId]);

  const derivation = useMemo(() => (machine ? deriveMachineSetup(machine) : null), [machine]);
  const recommendedBatchGrams = derivation?.recommendedBatchGrams ?? null;

  const machineView = buildHomeMachineView({
    machineKind: recipe.machineKind,
    // The recipe's own label is authoritative — including for a Professional recipe
    // opened in HOME, which §16 requires HOME to show unchanged.
    machineLabel:
      recipe.machineLabel ??
      (recipe.machineKind === 'professional' ? homeCreatorCopy.machine.savedLabel : null),
    targetBatchGrams: amount?.totalGrams ?? recipe.target_batch_grams,
    recommendedBatchGrams,
    containers:
      amount && recommendedBatchGrams
        ? (capacityGuidance(amount, recommendedBatchGrams)?.containers ?? 1)
        : 1,
    // „Zmień" already re-opens the machine STAGE through the flow; the view has to hear
    // about it too, or the section keeps rendering the summary and the chooser never
    // appears. Same state, propagated — no second machine authority.
    changeRequested: forceMachineStage,
  });

  const flow = useHomeFlow({
    // Matching (§32–§36) arrives in the next phase; until then a resolved intent goes
    // straight to Create-my-own rather than pretending a choice existed.
    requiresMatchChoice: false,
    matchResolved: true,
    hasMachine: !forceMachineStage && !machineView.needsMachineChoice,
  });

  const { result, score } = useHomeRecipeResult(draft.recipeReady);

  // Owner 2026-09-17 (B): recognise the idea and look for matching recipes while it is
  // described — the same resolution door and the same §32–§36 sources as the CTA.
  const suggestions = useHomeIdeaSuggestions({
    resolveOne: intentIngredients.resolveOne,
    enabled: !draft.recipeReady && !draft.preparationStarted,
  });

  // The layer is shown whenever the current idea version has matches the customer has not
  // yet decided about — before the CTA (after a committed chip, never over a word still
  // being typed) and after it (e.g. once a §23 identity answer completes the idea).
  const suggestionsVisible =
    suggestions.signature !== '' &&
    suggestions.cards.length > 0 &&
    !suggestions.isDismissed(suggestions.signature) &&
    !draft.recipeReady &&
    !resolving &&
    // Never over an idea that is still being recognised: one chip's cards would be
    // shown, then replaced (or emptied) the moment its sibling answers.
    !suggestions.recognising &&
    officialAdoption?.state !== 'loading' &&
    (draft.intentSubmitted || !composerHasText);
  const suggestionsFrom: 'idea' | 'cta' = draft.intentSubmitted ? 'cta' : 'idea';
  const selectedSuggestionId =
    suggestionChoice?.signature === suggestions.signature ? suggestionChoice.id : null;

  useEffect(() => {
    if (!suggestionsVisible) return;
    markHomeTiming('first-card', {
      idea: ideaFingerprint(suggestions.signature),
      from: draft.intentSubmitted ? 'cta' : 'idea',
    });
  }, [draft.intentSubmitted, suggestions.signature, suggestionsVisible]);

  /**
   * True while the customer is still being ASKED whether to start from an existing
   * recipe. Used to hold back automatic generation — see the generate effect below.
   */
  const matchPopupOpen = suggestionsVisible;

  const proposedName = useMemo(
    () =>
      proposeRecipeName({
        flavourLabels: draft.chips.map((chip) => chip.productName ?? chip.label),
        profile: draft.profile,
      }),
    [draft.chips, draft.profile],
  );
  const name = draft.recipeNameOverride ?? recipe.savedRecipeName ?? proposedName;

  // Keep the flow's record of which sections were actually shown in step with the
  // page, so a stage that was never asked never reappears as a Back target (§84).
  const presentStage = useHomeDraftStore((state) => state.presentStage);
  const stagesKey = flow.stages.join('|');
  useEffect(() => {
    for (const stage of stagesKey.split('|').filter(Boolean) as HomeStage[]) {
      presentStage(stage);
    }
  }, [stagesKey, presentStage]);

  /**
   * Write the machine through the canonical `setMachineSelection` authority — the SAME
   * call the Pro selector makes, with the same derivation, serving-mode routing and
   * capacity rule (§44). HOME adds no machine logic; the write is recipe-scoped, so
   * the account default is untouched (§47).
   */
  const applyMachineSelection = useCallback(
    (selected: HomeMachineProfile) => {
      const setup = deriveMachineSetup(selected, visibleProductTypeFor(draft.profile ?? 'gelato'));
      const mode = setup.resolvedVisibleMode;
      if (mode === null) return null;
      useRecipeStore.getState().setMachineSelection({
        kind: 'home',
        servingModeId: mode,
        machineId: selected.id,
        label: machineDisplayName(selected),
        machineTechnology: selected.technology,
        homeFormulationModuleId: selected.homeFormulationModuleId,
        temperatureC: setup.engineTemperatureC,
        batchGrams: setup.recommendedBatchGrams,
        hardCapacityGrams: setup.hardMaximumBatchGrams,
        batchSource: 'MACHINE_DEFAULT',
      });
      return setup;
    },
    [draft.profile],
  );

  /** §48: build the full base automatically through the canonical starter. */
  const generateRecipe = useCallback(
    (amountOverride?: HomeAmount | null) => {
      const profile = draft.profile;
      if (profile === null) return;
      const total =
        amountOverride?.totalGrams ??
        amount?.totalGrams ??
        defaultHomeAmount(recommendedBatchGrams)?.totalGrams ??
        recipe.target_batch_grams;
      const currentMachine = {
        kind: recipe.machineKind,
        servingModeId: recipe.servingModeId,
        machineId: recipe.machineId,
        label: recipe.machineLabel,
        machineTechnology: recipe.machineTechnology,
        homeFormulationModuleId: recipe.homeFormulationModuleId,
        temperatureC: recipe.target_temperature_c,
        batchGrams: total,
        hardCapacityGrams: recipe.machine_capacity_grams,
        batchSource: recipe.batch_source,
      } as const;

      useRecipeStore.getState().rebuildNewRecipeStarter({
        visibleProductType: visibleProductTypeFor(profile),
        servingModeId:
          starterServingModeForTemperature(recipe.target_temperature_c) ??
          DEFAULT_NEW_RECIPE_SERVING_MODE,
        formulationStrategy: DEFAULT_NEW_RECIPE_STRATEGY,
        targetBatchGrams: total,
      });
      // `rebuildNewRecipeStarter` is deliberately a NEW draft: it replaces the
      // product, the category, every ingredient AND the machine/temperature with the
      // account default. So the HOME machine choice must be re-asserted AFTER it —
      // otherwise the user's Ninja silently reverts to Professional, which is exactly
      // what happened before this line existed.
      if (machine) applyMachineSelection(machine);
      else if (
        currentMachine.kind === 'home' &&
        currentMachine.servingModeId &&
        currentMachine.label
      ) {
        useRecipeStore.getState().setMachineSelection({
          ...currentMachine,
          kind: 'home',
          servingModeId: currentMachine.servingModeId,
          label: currentMachine.label,
        });
      }
      // PACKAGE 2A (closed 2026-09-11) — a HOME draft is born in AUTO: every BASE
      // ingredient the customer supplies is a priority, and none of it is shown as
      // a crown. `rebuildNewRecipeStarter` starts a NEW draft and therefore resets
      // the mode to MANUAL, so this must come after it and before the chips below.
      useRecipeStore.getState().setPriorityMode('AUTO');
      setRecipeNotice(null);
      setInitialBuilding(true);
      // `null` means ProductBehavior materialisation is still in flight. An empty
      // array is reserved for the later, authoritative state where every resolved
      // chip has been consumed and the first solve may start.
      setInitialPrepared(null);

      // Resolve exact identity + ProductBehavior before showing any recipe. Every
      // role/amount question is completed from this queue; only then does the first
      // canonical solve run and expose the verified formulation.
      void (async () => {
        const prepared: PreparedIntentIngredient[] = [];
        for (const chip of useHomeDraftStore.getState().chips) {
          if (chip.productId === null || chip.ambiguous) continue;
          const resolved = await intentIngredients.prepareResolvedChip(chip);
          if (!resolved) {
            setRecipeNotice(
              `Nie udało się potwierdzić aktualnych danych produktu ${chip.productName ?? chip.label}. Wybierz produkt ponownie.`,
            );
            setInitialBuilding(false);
            lastGeneratedFor.current = null;
            return;
          }
          prepared.push(resolved);
        }
        setInitialPrepared(prepared);
      })();
    },
    [
      draft.profile,
      amount,
      machine,
      applyMachineSelection,
      intentIngredients,
      recommendedBatchGrams,
      recipe.target_batch_grams,
      recipe.target_temperature_c,
      recipe.batch_source,
      recipe.homeFormulationModuleId,
      recipe.machineId,
      recipe.machineKind,
      recipe.machineLabel,
      recipe.machineTechnology,
      recipe.machine_capacity_grams,
      recipe.servingModeId,
    ],
  );

  /**
   * §58 — the picked product waiting for the customer to say how they meant to use it.
   * Only reached for a product the catalogue says is genuinely BOTH; everything it can
   * settle is settled silently by `decideUsageRole`.
   */
  const [pendingUsage, setPendingUsage] = useState<{
    chipId: string | null;
    ingredient: EngineIngredient;
    behavior: ProductBehaviorSnapshot | null;
    source: 'initial' | 'live';
  } | null>(null);

  /**
   * The one place a Base line is created. Grams come either from the existing Crown flow
   * (0, meaning Crown decides) or from the customer's confirmed amount — never invented.
   */
  const addIngredientLine = useCallback(
    (ingredient: EngineIngredient, behavior: ProductBehaviorSnapshot | null, grams: number) => {
      const added = useRecipeStore
        .getState()
        .addIngredient(ingredient, grams, grams > 0 ? { amountIntent: 'user_exact' } : undefined);
      if (added.status === 'duplicate') return;
      if (behavior) {
        useRecipeStore
          .getState()
          .setProductBehaviorSnapshot(added.lineId, { ...behavior, lineId: added.lineId });
      }
      // Owner QA 2026-09-06: „wszystkie składniki dodane przez Dodaj składnik
      // automatycznie dostają koronę". This path never asked, while the intent-chip
      // path did — so the same product arrived crowned or bare depending only on how
      // it was added. Ask the SAME canonical authority here; it refuses on its own for
      // a product Main cannot carry, so this offers the crown rather than forcing it.
      // HOME surface: HOME's own Crown rules apply here and never reach PRO.
      // PACKAGE 2A: this is the AUTOMATIC door — a priority only while the draft is
      // still AUTO. After the customer's first crown the set is theirs, and a line
      // added later stays ordinary until they crown it.
      useRecipeStore.getState().grantAutomaticPriority(added.lineId);
    },
    [],
  );

  /**
   * ONE add path for every HOME surface — the refinement controls beside the chips and
   * the add controls beside the recipe list both land here, so the §B decision cannot
   * apply on one surface and not the other.
   */
  const addConfirmedTopping = useCallback(
    (
      ingredient: RecipeToppingIngredient,
      behavior?: ProductBehaviorSnapshot,
      grams = defaultHomeToppingGrams(useRecipeStore.getState().items),
    ) => {
      useRecipeStore.getState().addTopping(ingredient, grams);
      const topping = useRecipeStore
        .getState()
        .toppings.find((line) => line.ingredient.id === ingredient.id);
      if (topping && behavior) {
        useRecipeStore
          .getState()
          .setProductBehaviorSnapshot(topping.id, { ...behavior, lineId: topping.id });
      }
    },
    [],
  );

  const handleAddTopping = useCallback(
    (ingredient: RecipeToppingIngredient, behavior?: ProductBehaviorSnapshot) => {
      setPendingAdd({
        chipId: null,
        ingredient: ingredient as unknown as EngineIngredient,
        behavior: behavior ?? null,
        recommendedDose: null,
        kind: 'topping',
        initialGrams: defaultHomeToppingGrams(useRecipeStore.getState().items),
        source: 'live',
      });
    },
    [setPendingAdd],
  );

  const handleAddIngredient = useCallback(
    (ingredient: EngineIngredient, behavior?: ProductBehaviorSnapshot) => {
      // §58 FIRST: a product that is genuinely both has to be placed before it can be
      // measured — the amount question means something different for a topping.
      const usage = decideUsageRole(behavior ?? null);
      if (usage.kind === 'ask') {
        setPendingUsage({ chipId: null, ingredient, behavior: behavior ?? null, source: 'live' });
        return;
      }
      if (usage.role === 'topping') {
        handleAddTopping(ingredient as unknown as RecipeToppingIngredient, behavior);
        return;
      }
      // PACKAGE 2A: in MANUAL nothing will size a new line automatically, so the
      // existing HOME amount question applies to a Crown-capable product too.
      const decision = decideAddAmount(behavior ?? null, productRecommendedDosagePl, {
        autoPriority: autoPriorityAppliesToNewLine(useRecipeStore.getState().priority_mode),
      });
      if (decision.kind === 'unresolved_authority') {
        // Owner ruling §6: never guess. The picker already refuses a product it cannot
        // confirm, so reaching here means the authority went stale between resolution
        // and add — we create nothing rather than invent semantics.
        return;
      }
      if (decision.kind === 'ask_amount') {
        setPendingAdd({
          chipId: null,
          ingredient,
          behavior: behavior ?? null,
          recommendedDose: decision.recommendedDose,
          kind: 'ingredient',
          initialGrams: null,
          source: 'live',
        });
        return;
      }
      addIngredientLine(ingredient, behavior ?? null, 0);
    },
    [addIngredientLine, handleAddTopping, setPendingAdd],
  );

  const finishInitialRecipe = useCallback(async () => {
    if (initialFinalizing.current) return;
    initialFinalizing.current = true;
    const instructions = homeRecalculationInstructions(useRecipeStore.getState().items, []);
    if (instructions.length > 0) {
      await runInteractiveRecalculationWithTerminal(instructions);
    } else {
      await runPiRecalculationWithTerminal();
    }
    if (
      useConstraintStudioStore.getState().recalculationTerminal?.state === 'PREVIEW_READY' &&
      useConstraintStudioStore.getState().preview
    ) {
      await applyPreviewWithServerAuthority();
    }
    const terminal = useConstraintStudioStore.getState().recalculationTerminal;
    const ready =
      useConstraintStudioStore.getState().preview === null &&
      useConstraintStudioStore.getState().blocked === null &&
      useRecipeStore.getState().practicalRecipeAudit !== null &&
      terminal?.state !== 'ERROR' &&
      terminal?.state !== 'TIMEOUT';
    if (ready) {
      useHomeDraftStore.getState().markRecipeReady(true);
      setInitialBuilding(false);
      window.setTimeout(() => scrollToStage('recipe'), 60);
    } else {
      setRecipeNotice(
        'Nie udało się jeszcze bezpiecznie przygotować receptury. Sprawdź wybór produktu i spróbuj ponownie.',
      );
      setInitialBuilding(false);
      lastGeneratedFor.current = null;
    }
    initialFinalizing.current = false;
  }, [scrollToStage]);

  useEffect(() => {
    if (!initialBuilding || pendingAdd || pendingUsage || initialFinalizing.current) return;
    if (initialPrepared === null) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const next = initialPrepared[0];
      if (!next) {
        void finishInitialRecipe();
        return;
      }
      setInitialPrepared((queue) => queue?.slice(1) ?? null);
      const chip = useHomeDraftStore.getState().chips.find((item) => item.id === next.chipId);
      const savedRole = useHomeDraftStore.getState().usageAnswersByChipId[next.chipId];
      const usage =
        savedRole || chip?.role
          ? { kind: 'settled' as const, role: savedRole ?? chip!.role! }
          : decideUsageRole(next.behavior);
      if (usage.kind === 'ask') {
        setPendingUsage({
          chipId: next.chipId,
          ingredient: next.ingredient,
          behavior: next.behavior,
          source: 'initial',
        });
        return;
      }
      if (usage.role === 'topping') {
        const answered = useHomeDraftStore.getState().amountAnswersByChipId[next.chipId];
        if (answered && answered > 0) {
          addConfirmedTopping(
            next.ingredient as unknown as RecipeToppingIngredient,
            next.behavior,
            answered,
          );
          return;
        }
        setPendingAdd({
          chipId: next.chipId,
          ingredient: next.ingredient,
          behavior: next.behavior,
          recommendedDose: null,
          kind: 'topping',
          initialGrams: defaultHomeToppingGrams(useRecipeStore.getState().items),
          source: 'initial',
        });
        return;
      }
      const decision = decideAddAmount(next.behavior, productRecommendedDosagePl, {
        autoPriority: true,
      });
      if (decision.kind === 'crown_decides') {
        addIngredientLine(next.ingredient, next.behavior, 0);
        return;
      }
      if (decision.kind === 'ask_amount') {
        const answered = useHomeDraftStore.getState().amountAnswersByChipId[next.chipId];
        if (answered && answered > 0) {
          addIngredientLine(next.ingredient, next.behavior, answered);
          return;
        }
        setPendingAdd({
          chipId: next.chipId,
          ingredient: next.ingredient,
          behavior: next.behavior,
          recommendedDose: decision.recommendedDose,
          kind: 'ingredient',
          initialGrams: null,
          source: 'initial',
        });
        return;
      }
      setRecipeNotice(`Nie udało się potwierdzić roli produktu ${next.ingredient.name}.`);
      setInitialBuilding(false);
      lastGeneratedFor.current = null;
    });
    return () => {
      cancelled = true;
    };
  }, [
    addConfirmedTopping,
    addIngredientLine,
    finishInitialRecipe,
    initialBuilding,
    initialPrepared,
    pendingAdd,
    pendingUsage,
    setPendingAdd,
  ]);

  /** §57: the existing Topping behaviour — no Crown, editable grams. Shared identically. */

  useEffect(() => {
    // Generate once, when every required answer is in — never on every render.
    //
    // NOT while the match popup is open. „Czy zacząć od jednej z nich?" is an
    // unanswered question, and building a recipe behind it does more than waste work:
    // served QA 2026-08-31 showed this effect firing during a derivation, so
    // `rebuildNewRecipeStarter` replaced the recipe the customer had just adopted and
    // cleared its saved link. On screen that looked like a success — the ingredients
    // are the same canonical `milk-base:*` skeleton — and only the grams gave it away
    // (MILK 670 g -> 672 g, TARA GUM 5 g -> 3 g). The customer owned Anna's recipe and
    // was shown a generated one.
    const key = `${draft.profile}|${machine?.id ?? 'none'}|${amount?.totalGrams ?? 0}`;
    if (
      draft.intentSubmitted &&
      draft.profile !== null &&
      !machineView.needsMachineChoice &&
      !draft.recipeReady &&
      // A machine stage the customer actually saw ends at its explicit „Gotowe".
      // Saved/inherited defaults never present that stage and retain the accepted
      // automatic start below.
      !draft.presentedStages.includes('machine') &&
      !matchPopupOpen &&
      // Never while the idea is still being resolved and matched after the CTA: a
      // suggestion (or the §35 single match) may be about to become the recipe.
      !resolving &&
      // Nor before the Community answer for THIS version: a match arriving a moment
      // later must not land behind a recipe that was already built.
      suggestions.communitySettled &&
      // Never behind an official recipe that is still opening: it is about to BE the recipe.
      officialAdoption?.state !== 'loading' &&
      lastGeneratedFor.current !== key
    ) {
      lastGeneratedFor.current = key;
      generateRecipe();
    }
  }, [
    draft.intentSubmitted,
    draft.presentedStages,
    draft.profile,
    draft.recipeReady,
    matchPopupOpen,
    resolving,
    suggestions.communitySettled,
    officialAdoption?.state,
    machine?.id,
    amount?.totalGrams,
    machineView.needsMachineChoice,
    generateRecipe,
  ]);

  /** §35's automatic choice undone: the customer's own recipe, generated from their idea. */
  const createOwnInstead = () => {
    setOfficialAdoption(null);
    startNewProRecipe(visibleProductTypeFor(useHomeDraftStore.getState().profile ?? 'gelato'));
    useHomeDraftStore
      .getState()
      .setDerivation({ officialRecipeId: null, publicationId: null, label: null });
    lastGeneratedFor.current = null;
    useHomeDraftStore.getState().markRecipeReady(false);
  };

  const onSweetness = (choice: HomeSweetness) => {
    const stored = recipe.direction_targets.sweetness;
    // §62: writing only when the value actually changes keeps a Pro recipe's ±2
    // intact when its already-active segment is tapped.
    if (!tapChangesStoredValue(stored, choice)) return;
    useRecipeStore.getState().setDirectionTarget('sweetness', sweetnessValueForTap(choice));
  };

  const routePaidAction = (): boolean => {
    if (recipeSave.blocked === 'signin') {
      openAuthModal();
      return false;
    }
    if (recipeSave.blocked === 'plan') {
      navigate('/subscription');
      return false;
    }
    return recipeSave.blocked !== 'unavailable';
  };

  const persistForAction = async (action: Exclude<HomeFinalAction, 'make'>): Promise<void> => {
    if (!routePaidAction()) return;
    setActionNotice(null);
    const before = useRecipeStore.getState();
    if (action === 'save' && before.savedRecipeId && !before.dirty) {
      setActionNotice('Ta wersja jest już zapisana.');
      return;
    }
    const ok = before.savedRecipeId
      ? await recipeSave.saveVersion()
      : await recipeSave.createNew(name.trim() || proposedName);
    if (!ok) return;
    const saved = useRecipeStore.getState();
    if (saved.savedRecipeId && name.trim() && name.trim() !== saved.savedRecipeName) {
      await recipeSave.rename(name.trim());
    }
    if (action === 'share' || action === 'community') setCompletionDialog(action);
    else setActionNotice(`Zapisano wersję ${saved.currentVersionNumber ?? 1}.`);
  };

  const requestFinalAction = (action: HomeFinalAction): void => {
    if (action === 'make') {
      if (!routePaidAction()) return;
      setReviewAction('make');
      return;
    }
    if (!routePaidAction()) return;
    const current = useRecipeStore.getState();
    if ((action === 'share' || action === 'community') && !current.savedRecipeId) {
      setConfirmSaveAction(action);
      return;
    }
    if (current.dirty || current.practicalRecipeAudit === null) {
      setReviewAction(action);
      return;
    }
    if (action === 'share' || action === 'community') {
      setCompletionDialog(action);
      return;
    }
    void persistForAction(action);
  };

  const continueAfterReview = async (): Promise<void> => {
    const action = reviewAction;
    setReviewAction(null);
    if (!action) return;
    if (action === 'make') {
      useHomeDraftStore.getState().startPreparation();
      window.setTimeout(() => scrollToStage('preparation'), 60);
      return;
    }
    await persistForAction(action);
  };

  const machineLine = [
    machineView.label,
    machineView.amount.kind === 'containers'
      ? `${machineView.amount.containers} ${
          machineView.amount.containers === 1
            ? homeCreatorCopy.machine.container
            : homeCreatorCopy.machine.containers
        }`
      : `${machineView.amount.totalGrams} ${homeCreatorCopy.recipe.grams}`,
  ]
    .filter(Boolean)
    .join(' · ');

  /** „Create my recipe” — also „Tworzę swoją” chosen on the suggestions layer before it. */
  const submitIdea = () => {
    useHomeDraftStore.getState().submitIntent();
    // Owner 2026-09-17 (B): committed chips already resolve while the idea is described
    // (useHomeIdeaSuggestions); the CTA finishes whatever is still unresolved.
    setResolving(true);
    void (async () => {
      try {
        markHomeTiming('cta-tap', { chips: useHomeDraftStore.getState().chips.length });
        // §32–§40 matching runs on the RESOLVED identities (§22) — the same
        // idea version the suggestions layer already showed, if it did. `settle` finishes
        // every chip that still has no answer through the SAME door the layer used, so a
        // chip is never resolved twice and an answered §23 question is never overwritten.
        const { signature: settledIdea, result, dismissed } = await suggestions.settle();
        // §35: exactly one Gellatti recipe and nothing from Community — adopt it, with a
        // way back — unless the customer already saw and decided about that suggestion
        // („Tworzę swoją” dismisses it and then presses this same door).
        if (result.decision.kind === 'auto_adopt_official' && userId && !dismissed) {
          suggestions.dismiss(settledIdea);
          await adoptOfficialRecipe(result.decision.match.candidate.id, {
            keepIdea: true,
            automatic: true,
          });
        }
      } finally {
        setResolving(false);
      }
      // Owner QA 2026-09-06: this scroll used to sit OUTSIDE this async
      // block on a 60 ms timer, so it fired while identity resolution was
      // still in flight — carrying the customer down to the profile and
      // machine questions before they had chosen their products, and
      // leaving the product choice behind them at the top of the page.
      //
      // The flow may only advance once every element of the idea has a
      // concrete product (§84). `resolveIdea` is the single authority for
      // what "resolved" means; the amount gap it also reports belongs to a
      // later step, so only the product gap holds the flow here.
      const chips = useHomeDraftStore.getState().chips;
      const needsProductChoice = resolveIdea(chips).unresolved.some((element) =>
        element.gaps.includes('product'),
      );
      if (needsProductChoice) return;
      const next = useHomeDraftStore.getState().profile === null ? 'profile' : 'machine';
      scrollToStage(next);
    })();
  };

  return (
    <AppShell navigationPosition="trailing" stickyHeader contentClassName="pb-24">
      <div data-testid="home-creator">
        {officialAdoption ? (
          <HomeRecipeOriginNotice adoption={officialAdoption} onCreateOwn={createOwnInstead} />
        ) : draft.recipeReady && recipe.provenance ? (
          <HomeRecipeProvenanceLine provenance={recipe.provenance} />
        ) : !draft.recipeReady ? (
          <HomeRecipeSources />
        ) : null}
        {flow.stages.includes('intent') ? (
          <HomeIntentSection
            onSubmit={submitIdea}
            resolving={resolving}
            onDraftTextChange={setComposerHasText}
            onChooseIdentity={(chip, candidate) => {
              // §23: the user answered the identity question. Record the real
              // catalogue identity, clear the question, and — if the recipe already
              // exists — put the ingredient in it now.
              useHomeDraftStore.getState().resolveChip(chip.id, {
                productId: candidate.id,
                productName: candidate.name,
                ambiguous: false,
                candidates: undefined,
              });
              const state = useHomeDraftStore.getState();
              if (state.recipeReady) {
                const resolved = state.chips.find((entry) => entry.id === chip.id);
                if (resolved) void intentIngredients.addResolvedChip(resolved).then(askAmountFor);
              }
              // The answer changes the idea version, so matching re-runs on the real
              // identity by itself (useHomeIdeaSuggestions) and a new version's
              // suggestions are never suppressed by an earlier dismissal.
            }}
            onScan={() => setScannerOpen(true)}
          />
        ) : null}

        {scanNotice ? (
          // Polite, dismissible, and never in the way of the recipe itself.
          <p role="status" aria-live="polite" className="px-1 text-sm text-ink/60">
            {scanNotice}
          </p>
        ) : null}

        {recipeNotice ? (
          <p
            role="alert"
            className="mx-auto my-4 max-w-2xl rounded-xl border px-4 py-3 text-sm"
            style={{ borderColor: 'var(--g-line)', color: 'var(--g-attention-ink)' }}
            data-testid="home-recipe-notice"
          >
            {recipeNotice}
          </p>
        ) : null}

        {flow.stages.includes('profile') ? (
          <HomeProfileSection
            selected={draft.profile}
            onSelect={(profile) => {
              useHomeDraftStore.getState().setProfile(profile);
              window.setTimeout(() => scrollToStage('machine'), 60);
            }}
            onBack={
              flow.backFrom('profile') ? () => scrollToStage(flow.backFrom('profile')!) : null
            }
          />
        ) : null}

        {flow.stages.includes('machine') ? (
          <HomeMachineSection
            view={machineView}
            amount={amount}
            recommendedBatchGrams={recommendedBatchGrams}
            onSelectMachine={(selected) => {
              // §44/§47: the machine goes through the SAME `setMachineSelection`
              // authority the Pro selector uses — same derivation, same serving-mode
              // routing, same capacity rule. HOME adds no machine logic of its own,
              // and the write is recipe-scoped, so the account default is untouched.
              const setup = deriveMachineSetup(
                selected,
                visibleProductTypeFor(draft.profile ?? 'gelato'),
              );
              const mode = setup.resolvedVisibleMode;
              if (mode === null) return;
              setMachine(selected);
              setForceMachineStage(false);
              setAmount(defaultHomeAmount(setup.recommendedBatchGrams));
              useRecipeStore.getState().setMachineSelection({
                kind: 'home',
                servingModeId: mode,
                machineId: selected.id,
                label: machineDisplayName(selected),
                machineTechnology: selected.technology,
                homeFormulationModuleId: selected.homeFormulationModuleId,
                temperatureC: setup.engineTemperatureC,
                batchGrams: setup.recommendedBatchGrams,
                hardCapacityGrams: setup.hardMaximumBatchGrams,
                batchSource: 'MACHINE_DEFAULT',
              });
            }}
            onOtherMachine={() => setForceMachineStage(true)}
            onAmountChange={(next) => {
              setAmount(next);
              if (draft.recipeReady) {
                useRecipeStore
                  .getState()
                  .setBatchGrams(next.totalGrams, undefined, 'USER_OVERRIDE');
              }
            }}
            onChangeMachine={() => {
              // The machine is deliberately NOT cleared: `forceMachineStage` alone opens
              // the chooser, and keeping it means Anuluj restores the exact previous
              // presentation instead of dropping to a plain amount.
              setForceMachineStage(true);
            }}
            onCancelChange={() => setForceMachineStage(false)}
            onDone={() => {
              // Done also ENDS an open change request, so „Zmień" -> „Gotowe" returns to
              // the summary even when the customer picked nothing. Selecting already
              // clears it; this covers the cancel path.
              setForceMachineStage(false);
              if (!draft.recipeReady) {
                const key = `${draft.profile}|${machine?.id ?? 'none'}|${amount?.totalGrams ?? 0}`;
                if (lastGeneratedFor.current !== key) {
                  lastGeneratedFor.current = key;
                  generateRecipe(amount);
                }
                return;
              }
              // §85: Done updates the SAME recipe and returns to the live position.
              if (amount) {
                useRecipeStore
                  .getState()
                  .setBatchGrams(amount.totalGrams, undefined, 'USER_OVERRIDE');
              }
              scrollToStage('recipe');
            }}
            onBack={
              flow.backFrom('machine') ? () => scrollToStage(flow.backFrom('machine')!) : null
            }
          />
        ) : null}

        {flow.stages.includes('recipe') ? (
          <HomeRecipeSection
            name={name}
            onNameChange={(next) => useHomeDraftStore.getState().setRecipeNameOverride(next)}
            score={score}
            machineLine={machineLine}
            items={recipe.items}
            toppings={recipe.toppings}
            /* PACKAGE 2A — an AUTO priority is real for the Engine but was never
               chosen, so it is not shown as a crown. Visible crowns are the ones
               the customer set. */
            crownLineIds={visibleCrownLineIds(recipe.items, recipe.priority_mode)}
            canSeeGrams={canSeeGrams}
            sweetnessStored={recipe.direction_targets.sweetness}
            onSweetness={onSweetness}
            onRemoveItem={(lineId) => useRecipeStore.getState().removeItem(lineId)}
            onGramsBlocked={() => {
              // The row keeps its controls for everyone (owner, 2026-08-31), so operating
              // a masked one routes to the EXISTING entitlement behaviour rather than
              // silently doing nothing. Same routing the canonical Save already uses.
              if (recipeSave.blocked === 'signin') {
                openAuthModal();
                return;
              }
              navigate('/subscription');
            }}
            library={library}
            onAddIngredient={handleAddIngredient}
            onAddTopping={handleAddTopping}
            onSave={() => {
              requestFinalAction('save');
            }}
            // The canonical handler owns the reason; HOME only has to show it, filtered
            // into customer language the same way every other HOME notice is.
            saveNotice={homeCustomerNotice(recipeSave.error)}
            onLetsMakeIt={() => requestFinalAction('make')}
            onShare={() => requestFinalAction('share')}
            onCommunity={() => requestFinalAction('community')}
            onBack={flow.backFrom('recipe') ? () => scrollToStage(flow.backFrom('recipe')!) : null}
          />
        ) : null}

        {draft.recipeReady && actionNotice ? (
          <p
            className="mt-3 text-center text-[13px] leading-snug"
            data-testid="home-action-notice"
            role="status"
            aria-live="polite"
            style={{ color: 'var(--g-attention-ink)' }}
          >
            {actionNotice}
          </p>
        ) : null}

        {draft.preparationStarted ? (
          <HomePreparation
            name={name}
            onSave={() => requestFinalAction('save')}
            onShare={() => requestFinalAction('share')}
            onCommunity={() => requestFinalAction('community')}
          />
        ) : null}
      </div>

      <HomeRecalculate
        open={reviewAction !== null}
        context={reviewAction ?? 'make'}
        onClose={() => setReviewAction(null)}
        onApplied={continueAfterReview}
        canSeeGrams={canSeeGrams}
        onGramsBlocked={() => {
          if (recipeSave.blocked === 'signin') openAuthModal();
          else navigate('/subscription');
        }}
      />

      {confirmSaveAction ? (
        <div
          className="fixed inset-0 z-[96] grid place-items-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          data-testid="home-save-before-share"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <h2 className="text-xl font-semibold">
              {confirmSaveAction === 'share' ? 'Zapisz i udostępnij' : 'Zapisz i opublikuj'}
            </h2>
            <p className="mt-3 text-sm text-stone-600">
              Link i publikacja zawsze wskazują jedną dokładną, niezmienną wersję receptury.
            </p>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                className="min-h-11 flex-1 rounded-full bg-ink px-4 text-sm font-semibold text-white"
                onClick={() => {
                  const action = confirmSaveAction;
                  setConfirmSaveAction(null);
                  if (
                    useRecipeStore.getState().dirty ||
                    useRecipeStore.getState().practicalRecipeAudit === null
                  )
                    setReviewAction(action);
                  else void persistForAction(action);
                }}
              >
                {confirmSaveAction === 'share' ? 'Zapisz i udostępnij' : 'Zapisz i opublikuj'}
              </button>
              <button
                type="button"
                className="min-h-11 rounded-full border px-4 text-sm"
                onClick={() => setConfirmSaveAction(null)}
              >
                Wróć
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {completionDialog === 'share' && recipe.savedRecipeId && recipe.currentVersionNumber ? (
        <ShareRecipeDialog
          recipeId={recipe.savedRecipeId}
          versionNumber={recipe.currentVersionNumber}
          onClose={() => setCompletionDialog(null)}
        />
      ) : null}
      {completionDialog === 'community' && recipe.savedRecipeId && recipe.currentVersionNumber ? (
        <PublishToCommunityDialog
          recipeId={recipe.savedRecipeId}
          versionNumber={recipe.currentVersionNumber}
          defaultTitle={name}
          hasCreatorProfile={hasCreatorProfile}
          completionContext={draft.preparationStarted}
          onClose={() => setCompletionDialog(null)}
        />
      ) : null}
      {/* §36 — shown ONLY when a trustworthy match survived the strict matcher.
          No match means no modal at all: creation simply continues (§35), which is
          why there is no "nothing found" state here. */}
      {suggestionsVisible ? (
        <HomeMatchGate
          cards={suggestions.cards}
          communityMatch={suggestions.communityMatch}
          ideaLabel={draft.chips.map((chip) => chip.label).join(', ')}
          selectedId={selectedSuggestionId}
          onSelect={(id) => setSuggestionChoice({ signature: suggestions.signature, id })}
          onChooseOfficial={(match) => {
            // The customer chose a Gellatti recipe: it opens here as their working copy.
            // A guest is asked to sign in first and the layer stays with the choice.
            if (!userId) {
              openAuthModal();
              return;
            }
            suggestions.dismiss(suggestions.signature);
            void adoptOfficialRecipe(match.candidate.id, { keepIdea: true, automatic: false });
          }}
          onCreateMyOwn={() => {
            suggestions.dismiss(suggestions.signature);
            // „Tworzę swoją” before the CTA IS the CTA for the customer's own recipe.
            if (suggestionsFrom === 'idea') submitIdea();
          }}
          onSkip={() => {
            // Before the CTA „Pomiń” returns to the idea; after it, the own recipe continues.
            suggestions.dismiss(suggestions.signature);
          }}
          onDerived={() => {
            // `HomeMatchGate` has already loaded the derived recipe into the shared
            // store (the canonical derivation itself ends on the PRO route, which §13
            // bounces for a HOME subscriber), so HOME stops offering the choice, opens
            // the recipe stage and scrolls the customer to the recipe they now own.
            suggestions.dismiss(suggestions.signature);
            useHomeDraftStore.getState().markRecipeReady(true);
            // Claim the generate key WITHOUT generating: the adopted recipe IS the
            // recipe, so the effect must not build one for these same answers.
            lastGeneratedFor.current = `${draft.profile}|${machine?.id ?? 'none'}|${amount?.totalGrams ?? 0}`;
            scrollToStage('recipe');
          }}
        />
      ) : null}

      {/* §B: asked BEFORE the line exists, so a refusal costs the customer nothing. */}
      {pendingUsage ? (
        <HomeUsagePrompt
          productName={pendingUsage.ingredient.name}
          onCancel={() => {
            if (pendingUsage.source === 'initial' && pendingUsage.chipId) {
              useHomeDraftStore.getState().removeChip(pendingUsage.chipId);
            }
            setPendingUsage(null);
          }}
          onChoose={(role) => {
            const { ingredient, behavior, chipId, source } = pendingUsage;
            if (source === 'initial' && chipId) {
              useHomeDraftStore.getState().answerUsage(chipId, role);
            }
            setPendingUsage(null);
            if (role === 'topping') {
              handleAddTopping(
                ingredient as unknown as RecipeToppingIngredient,
                behavior ?? undefined,
              );
              return;
            }
            // The amount question still applies to an ingredient, exactly as it does
            // for a product that never needed the usage question at all.
            const decision = decideAddAmount(behavior, productRecommendedDosagePl, {
              autoPriority: autoPriorityAppliesToNewLine(useRecipeStore.getState().priority_mode),
            });
            if (decision.kind === 'ask_amount') {
              setPendingAdd({
                ingredient,
                behavior,
                recommendedDose: decision.recommendedDose,
                chipId,
                kind: 'ingredient',
                initialGrams: null,
                source,
              });
              return;
            }
            if (decision.kind === 'unresolved_authority') return;
            // The SAME line-creation path a product that never needed the question takes.
            addIngredientLine(ingredient, behavior, 0);
          }}
        />
      ) : null}

      {pendingAdd ? (
        <HomeAmountPrompt
          key={pendingAdd.ingredient.id}
          productName={pendingAdd.ingredient.name}
          recommendedDose={pendingAdd.recommendedDose}
          initialGrams={pendingAdd.initialGrams}
          onCancel={() => {
            if (pendingAdd.source === 'initial' && pendingAdd.chipId) {
              useHomeDraftStore.getState().removeChip(pendingAdd.chipId);
            }
            setPendingAdd(null);
          }}
          onConfirm={(grams) => {
            if (pendingAdd.source === 'initial' && pendingAdd.chipId) {
              useHomeDraftStore.getState().answerAmount(pendingAdd.chipId, grams);
            }
            if (pendingAdd.kind === 'topping') {
              addConfirmedTopping(
                pendingAdd.ingredient as unknown as RecipeToppingIngredient,
                pendingAdd.behavior ?? undefined,
                grams,
              );
            } else {
              addIngredientLine(pendingAdd.ingredient, pendingAdd.behavior, grams);
            }
            setPendingAdd(null);
          }}
        />
      ) : null}

      {/* The engine result is consumed for the Score only; no metric is rendered (§52). */}
      <span hidden data-testid="home-result-present">
        {result ? 'yes' : 'no'}
      </span>

      {/*
        OWNER DECISION 2026-09-06 — ONE CANONICAL SCANNER. HOME mounts the same component the recipe
        picker and the products page mount, with the same pipeline; only the entry context and the
        return action differ. A signed-out visitor scanning in the demo may FIND a product but never
        create one, so the entry says so and the scanner spends nothing on them.
      */}
      {scannerOpen ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-white p-4">
          <div className="mx-auto max-w-lg space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">Skanuj produkt</h2>
              <button
                type="button"
                className="pro-focus-ring rounded-full border border-ink/15 px-3 py-1 text-xs font-semibold text-ink"
                onClick={() => setScannerOpen(false)}
              >
                Zamknij
              </button>
            </div>
            <ScanFlow
              mode="recipe"
              entryContext={userId === null ? 'guest_demo' : 'recipe_ingredient'}
              onResolved={(product) => {
                setScanNotice(null);
                setScannerOpen(false);
                // The SAME door a typed ingredient uses. The scanner supplies the identity;
                // every rule about what it may do in a recipe stays where it lives.
                void intentIngredients.addScannedProduct(product).then(askAmountFor);
              }}
              onReturn={() => setScannerOpen(false)}
              onChoosePlan={(plan) => {
                setScannerOpen(false);
                navigate(plan === 'pro' ? '/subscription?plan=pro' : '/subscription?plan=home');
              }}
              resolveLabel="Dodaj do receptury"
              intro="Pokaż kod kreskowy produktu aparatowi. Znaleziony lub zapisany produkt wraca prosto do tej receptury."
            />
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
