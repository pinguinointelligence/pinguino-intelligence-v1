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
import { useNavigate } from 'react-router';
import { AppShell } from '@/features/shell/AppShell';
import { deriveMachineSetup, type HomeMachineProfile } from '@/features/machine-catalog';
import { machineDisplayName } from '@/features/machine-onboarding/machineViews';
import { temperatureForMode } from '@/features/customer-flow/servingMode';
import { useRecipeStore } from '@/stores/recipeStore';
import {
  DEFAULT_NEW_RECIPE_SERVING_MODE,
  DEFAULT_NEW_RECIPE_STRATEGY,
  starterServingModeForTemperature,
} from '@/features/recipes/newRecipeStarter';
import { homeCreatorCopy } from '@/features/home-creator/homeCreatorCopy';
import { useHomeDraftStore } from '@/features/home-creator/homeDraftStore';
import {
  useHomeEntitlement,
  useCanSeeExactGrams,
} from '@/features/home-creator/useHomeEntitlement';
import { useHomeFlow } from '@/features/home-creator/useHomeFlow';
import { useHomeRecipeResult } from '@/features/home-creator/useHomeRecipeResult';
import { useHomeIntentIngredients } from '@/features/home-creator/useHomeIntentIngredients';
import { HomeMatchGate } from '@/features/home-creator/matching/HomeMatchGate';
import {
  NO_MATCH,
  searchExistingRecipes,
  type HomeMatchResult,
} from '@/features/home-creator/matching/homeMatchSearch';
import { currentUserHasOwnerReviewAccess } from '@/services/ownerReviewAccess';
import { useIngredientLibrary } from '@/features/ingredient-builder/useIngredientLibrary';
import { useCanonicalRecipeSave } from '@/features/recipes/useCanonicalRecipeSave';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { useAuthStore } from '@/stores/authStore';
import { visibleProductTypeFor } from '@/features/home-creator/homeProfileMapping';
import { proposeRecipeName } from '@/features/home-creator/homeRecipeName';
import { buildHomeMachineView } from '@/features/home-creator/homeMachinePresentation';
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
import { HomeProSwitch } from '@/features/home-creator/ui/HomeProSwitch';
import { HomeIntentSection } from '@/features/home-creator/ui/HomeIntentSection';
import { HomeProfileSection } from '@/features/home-creator/ui/HomeProfileSection';
import { HomeMachineSection } from '@/features/home-creator/ui/HomeMachineSection';
import { HomeRecipeSection } from '@/features/home-creator/ui/HomeRecipeSection';

/** Smooth movement to the next section — the only "navigation" HOME has (§83). */
function useScrollToStage() {
  return useCallback((stage: HomeStage) => {
    if (typeof document === 'undefined') return;
    const element = document.getElementById(stage);
    element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
}

export function HomeCreatorPage() {
  const entitlement = useHomeEntitlement();
  const canSeeGrams = useCanSeeExactGrams();
  const scrollToStage = useScrollToStage();

  const draft = useHomeDraftStore();
  const recipe = useRecipeStore();

  // A machine chosen for THIS recipe (§47: recipe-scoped, never the account default).
  const [machine, setMachine] = useState<HomeMachineProfile | null>(null);
  const [amount, setAmount] = useState<HomeAmount | null>(null);
  const [forceMachineStage, setForceMachineStage] = useState(false);
  const [resolving, setResolving] = useState(false);
  // §35: `null` means matching has not run; NO_MATCH means it ran and found nothing,
  // which is a normal outcome that shows no popup at all.
  const [matchResult, setMatchResult] = useState<HomeMatchResult | null>(null);
  const [matchDismissed, setMatchDismissed] = useState(false);
  const intentIngredients = useHomeIntentIngredients();
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
  });

  const flow = useHomeFlow({
    // Matching (§32–§36) arrives in the next phase; until then a resolved intent goes
    // straight to Create-my-own rather than pretending a choice existed.
    requiresMatchChoice: false,
    matchResolved: true,
    hasMachine: !forceMachineStage && !machineView.needsMachineChoice,
  });

  const { result, score } = useHomeRecipeResult(draft.recipeReady);

  // Narrow the §35 decision ONCE. `show_popup` is the only kind that renders anything;
  // `auto_adopt_official` and `create_my_own` both continue silently.
  const matchPopup = useMemo(() => {
    if (matchResult === null || matchResult.decision.kind !== 'show_popup') return null;
    const { official, community } = matchResult.decision;
    return {
      official,
      community,
      communityMatch:
        community === null
          ? null
          : (matchResult.communityMatches.find(
              (entry) => entry.publicationId === community.candidate.id,
            ) ?? null),
    };
  }, [matchResult]);

  const proposedName = useMemo(
    () =>
      proposeRecipeName({
        flavourLabels: draft.chips.map((chip) => chip.productName ?? chip.label),
        profile: draft.profile,
      }),
    [draft.chips, draft.profile],
  );
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const name = nameOverride ?? recipe.savedRecipeName ?? proposedName;

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
   * §32–§40: run existing-recipe matching for whatever identities are RESOLVED right
   * now. Called after `Create my recipe`, and again after a §23 identity answer.
   *
   * The second call is not a nicety. Matching may only use resolved identities (§22),
   * so an intent whose ingredient was still ambiguous at submit time matches nothing —
   * and since "which cream did you mean?" is the common case, without a re-run the
   * popup would almost never appear. Found in served QA on 2026-08-31.
   */
  const runMatching = useCallback(async () => {
    const chips = useHomeDraftStore.getState().chips;
    const requested = chips
      .filter((chip) => chip.productId !== null && !chip.ambiguous)
      .map((chip) => ({
        productId: chip.productId as string,
        statedRole: chip.role,
        displayName: chip.productName ?? chip.label,
      }));
    if (requested.length === 0) {
      setMatchResult(NO_MATCH);
      return;
    }
    const canOpenOwnerReview = userId ? await currentUserHasOwnerReviewAccess(userId) : false;
    setMatchResult(
      await searchExistingRecipes({
        requested,
        profile: useHomeDraftStore.getState().profile,
        canOpenOwnerReview,
      }),
    );
  }, [userId]);

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
      const temperatureC = mode ? temperatureForMode(mode) : null;
      if (mode === null || temperatureC === null) return null;
      useRecipeStore.getState().setMachineSelection({
        kind: 'home',
        servingModeId: mode,
        machineId: selected.id,
        label: machineDisplayName(selected),
        machineTechnology: selected.technology,
        temperatureC,
        batchGrams: setup.recommendedBatchGrams,
        capacityGrams: setup.recommendedBatchGrams,
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
      useHomeDraftStore.getState().markRecipeReady(true);

      // §22/§49: the base is correct for the profile but is not yet what the user
      // ASKED for. Add each resolved flavour through the same store action the Pro
      // builder uses, and let the Main authority decide the crown.
      void (async () => {
        for (const chip of useHomeDraftStore.getState().chips) {
          if (chip.productId === null || chip.ambiguous) continue;
          await intentIngredients.addResolvedChip(chip);
        }
      })();

      window.setTimeout(() => scrollToStage('recipe'), 60);
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
      scrollToStage,
    ],
  );

  const lastGeneratedFor = useRef<string | null>(null);
  useEffect(() => {
    // Generate once, when every required answer is in — never on every render.
    const key = `${draft.profile}|${machine?.id ?? 'none'}|${amount?.totalGrams ?? 0}`;
    if (
      draft.intentSubmitted &&
      draft.profile !== null &&
      !machineView.needsMachineChoice &&
      !draft.recipeReady &&
      lastGeneratedFor.current !== key
    ) {
      lastGeneratedFor.current = key;
      generateRecipe();
    }
  }, [
    draft.intentSubmitted,
    draft.profile,
    draft.recipeReady,
    machine?.id,
    amount?.totalGrams,
    machineView.needsMachineChoice,
    generateRecipe,
  ]);

  const onSweetness = (choice: HomeSweetness) => {
    const stored = recipe.direction_targets.sweetness;
    // §62: writing only when the value actually changes keeps a Pro recipe's ±2
    // intact when its already-active segment is tapped.
    if (!tapChangesStoredValue(stored, choice)) return;
    useRecipeStore.getState().setDirectionTarget('sweetness', sweetnessValueForTap(choice));
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

  return (
    <AppShell
      navigationPosition="trailing"
      stickyHeader
      actions={<HomeProSwitch entitlement={entitlement} activeView="home" />}
      contentClassName="pb-24"
    >
      <div data-testid="home-creator">
        {flow.stages.includes('intent') ? (
          <HomeIntentSection
            onSubmit={() => {
              useHomeDraftStore.getState().submitIntent();
              // §18: identity resolution starts HERE — never while the user is still
              // describing the idea.
              setResolving(true);
              void (async () => {
                try {
                  for (const chip of useHomeDraftStore.getState().chips) {
                    if (chip.productId !== null) continue;
                    await intentIngredients.resolveOne(chip);
                  }
                  // §32–§40 matching runs on the RESOLVED identities (§22).
                  await runMatching();
                } finally {
                  setResolving(false);
                }
              })();
              window.setTimeout(() => {
                const next = draft.profile === null ? 'profile' : 'machine';
                scrollToStage(next);
              }, 60);
            }}
            resolving={resolving}
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
                if (resolved) void intentIngredients.addResolvedChip(resolved);
              } else if (state.intentSubmitted) {
                // The answer completed the intent, so matching can finally run on a
                // real identity. Without this the popup never appears for any
                // ambiguous ingredient — which is most of them.
                setMatchDismissed(false);
                void runMatching();
              }
            }}
            onScan={() => {
              // The cheap scanner pre-check is Phase 2; until it exists the button
              // must not pretend to work, so it is not wired to a fake result.
            }}
          />
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
              const temperatureC = mode ? temperatureForMode(mode) : null;
              if (mode === null || temperatureC === null) return;
              setMachine(selected);
              setForceMachineStage(false);
              setAmount(defaultHomeAmount(setup.recommendedBatchGrams));
              useRecipeStore.getState().setMachineSelection({
                kind: 'home',
                servingModeId: mode,
                machineId: selected.id,
                label: machineDisplayName(selected),
                machineTechnology: selected.technology,
                temperatureC,
                batchGrams: setup.recommendedBatchGrams,
                capacityGrams: setup.recommendedBatchGrams,
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
              setMachine(null);
              setForceMachineStage(true);
            }}
            onDone={() => {
              // §85: Done updates the SAME recipe and returns to the live position.
              if (draft.recipeReady && amount) {
                useRecipeStore
                  .getState()
                  .setBatchGrams(amount.totalGrams, undefined, 'USER_OVERRIDE');
              }
              scrollToStage(draft.recipeReady ? 'recipe' : 'machine');
            }}
            onBack={
              flow.backFrom('machine') ? () => scrollToStage(flow.backFrom('machine')!) : null
            }
          />
        ) : null}

        {flow.stages.includes('recipe') ? (
          <HomeRecipeSection
            name={name}
            onNameChange={setNameOverride}
            score={score}
            machineLine={machineLine}
            items={recipe.items}
            toppings={recipe.toppings}
            crownLineIds={recipe.items
              .filter((item) => item.lock_type === 'main')
              .map((item) => item.id)}
            canSeeGrams={canSeeGrams}
            sweetnessStored={recipe.direction_targets.sweetness}
            onSweetness={onSweetness}
            onRemoveItem={(lineId) => useRecipeStore.getState().removeItem(lineId)}
            onSubstitute={() => undefined}
            onUnavailable={(lineId) => useRecipeStore.getState().markIngredientUnavailable(lineId)}
            library={library}
            onAddIngredient={(ingredient, behavior) => {
              // Added at 0 g exactly as the Pro builder does — HOME invents no amount.
              const added = useRecipeStore.getState().addIngredient(ingredient, 0);
              if (added.status !== 'duplicate' && behavior) {
                useRecipeStore
                  .getState()
                  .setProductBehaviorSnapshot(added.lineId, { ...behavior, lineId: added.lineId });
              }
            }}
            onAddTopping={(ingredient, behavior) => {
              // §57: the existing Topping behaviour — no Crown, editable grams.
              useRecipeStore.getState().addTopping(ingredient, 0);
              const topping = useRecipeStore
                .getState()
                .toppings.find((line) => line.ingredient.id === ingredient.id);
              if (topping && behavior) {
                useRecipeStore
                  .getState()
                  .setProductBehaviorSnapshot(topping.id, { ...behavior, lineId: topping.id });
              }
            }}
            onSave={() => {
              // §65: an explicit action, never an autosave. The canonical handler
              // already knows WHY a save cannot proceed, so HOME routes on its answer
              // instead of re-deciding entitlement (§72: Save is a paid action).
              if (recipeSave.blocked === 'signin') {
                openAuthModal();
                return;
              }
              if (recipeSave.blocked === 'plan') {
                // The dedicated HOME/PRO plan-choice paywall is not built yet, so the
                // existing subscription page is used rather than a dead button.
                navigate('/subscription');
                return;
              }
              if (recipeSave.blocked === 'unavailable') return;
              void (recipe.savedRecipeId
                ? recipeSave.saveVersion()
                : recipeSave.createNew(name.trim()));
            }}
            onLetsMakeIt={() => useHomeDraftStore.getState().startPreparation()}
            onShare={() => undefined}
            canShare={false}
            onBack={flow.backFrom('recipe') ? () => scrollToStage(flow.backFrom('recipe')!) : null}
          />
        ) : null}
      </div>
      {/* §36 — shown ONLY when a trustworthy match survived the strict matcher.
          No match means no modal at all: creation simply continues (§35), which is
          why there is no "nothing found" state here. */}
      {matchPopup !== null && !matchDismissed ? (
        <HomeMatchGate
          official={matchPopup.official}
          community={matchPopup.community}
          communityMatch={matchPopup.communityMatch}
          onChooseOfficial={() => {
            // Opening an official template is the existing owner-review handoff; the
            // popup closes and the user continues in the recipe it loaded.
            setMatchDismissed(true);
          }}
          onCreateMyOwn={() => setMatchDismissed(true)}
          onDerived={() => {
            // `HomeMatchGate` has already loaded the derived recipe into the shared
            // store (the canonical derivation itself ends on the PRO route, which §13
            // bounces for a HOME subscriber), so HOME stops offering the choice, opens
            // the recipe stage and scrolls the customer to the recipe they now own.
            setMatchDismissed(true);
            useHomeDraftStore.getState().markRecipeReady(true);
            scrollToStage('recipe');
          }}
        />
      ) : null}

      {/* The engine result is consumed for the Score only; no metric is rendered (§52). */}
      <span hidden data-testid="home-result-present">
        {result ? 'yes' : 'no'}
      </span>
    </AppShell>
  );
}
