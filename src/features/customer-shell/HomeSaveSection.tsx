/**
 * Customer `/start` — SAVE THIS RECIPE (Home-save repair, 2026-07-26).
 *
 * The repair: the canonical plan matrix grants Home exactly ONE saved recipe, but `/start` had no
 * save affordance at all and `/pro` (the only mounted save UI) gates a `home` persona behind the
 * Pro upgrade prompt — so a paying Home subscriber could never save anything. This section is that
 * missing affordance, and it is the ONLY thing added to the customer surface.
 *
 * ONE persistence path: it delegates to `useCanonicalRecipeSave` (the canonical pro-core
 * RecipesRepository handler) — it never calls a repository itself, so there is still exactly one
 * save handler in the product. It saves the shell's OWN engine payload (`recipeInput`) and passes
 * `linkStoreDraft: false`, so a Home save can never hijack the Pro recipe-store draft's link.
 *
 * WHAT THE PLAN ALLOWS, HONESTLY (`resolveHomeSaveState`):
 *  - Demo → nothing renders (saving is blocked for Demo; the paywall owns that surface);
 *  - Home with no saved recipe → name + „Zapisz recepturę" (creates the aggregate + v1);
 *  - Home at its one-recipe limit → „Zapisz jako wersję N" of THAT recipe, with the rule stated
 *    plainly — never a dead-end error, never a silent overwrite of the customer's recipe;
 *  - Pro → always the create form (Pro is unlimited);
 *  - signed out / no backend / not-yet-calculated → the honest state, never a button that lies.
 *
 * HONEST failure: a backend error stays on screen, the form keeps the name + note, the action can
 * be retried, and nothing claims "saved" — the confirmation appears only after a real success.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { RecipeInput } from '@/engine';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { useProCorePersona } from '@/features/pro-core/useProCorePersona';
import { useProCoreRecipes } from '@/features/pro-core/useProCoreRecipes';
import { resolveRecipesRepository } from '@/features/pro-core/proCoreRecipeRepo';
import { useCanonicalRecipeSave } from '@/features/recipes/useCanonicalRecipeSave';
import { useAuthStore } from '@/stores/authStore';
import { customerShellAccessFor } from './customerShellAccess';
import { customerShellCopy } from './customerShellCopy';
import { resolveHomeSaveState, proposeRecipeTitle, type HomeSaveState } from './homeRecipeSave';
import { TextField, TouchButton, notice } from './ui';

const c = customerShellCopy.save;

/** Quiet informational line — the shell's neutral notice surface. */
function Line({ children }: { children: ReactNode }) {
  return (
    <p
      className={`rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${notice.neutral} ${notice.text}`}
    >
      {children}
    </p>
  );
}

export function HomeSaveSection({
  recipeInput,
  resultTitle,
}: {
  /** The REAL engine payload behind the visible result, or null for a structure-only preview. */
  recipeInput: RecipeInput | null;
  /** The result heading — proposed as the recipe name (the customer may edit it). */
  resultTitle: string;
}) {
  const persona = useProCorePersona();
  // The SAME canonical capability the rest of the shell is gated on (never a second rule).
  const caps = customerShellAccessFor(persona).save;

  const authed = useAuthStore((s) => s.status) === 'authed';
  const authUserId = useAuthStore((s) => (s.status === 'authed' ? (s.user?.id ?? null) : null));
  const openAuthModal = useAuthModalStore((s) => s.open);

  const repoState = useMemo(() => resolveRecipesRepository(), []);
  const ownerId = authUserId ?? (repoState.isLocalDev ? 'local-dev-user' : '');
  const repositoryAvailable = !repoState.unavailable && repoState.repository !== null;

  // The owner's aggregates decide create-vs-version. Disabled until a save could actually happen,
  // so an anonymous visitor or an unconfigured build never fetches.
  const listEnabled = caps.canSaveRecipe && authed && repositoryAvailable && recipeInput !== null;
  const recipesQuery = useProCoreRecipes(repoState.repository, ownerId, listEnabled);

  const state: HomeSaveState = resolveHomeSaveState({
    caps,
    authed,
    repositoryAvailable,
    hasCalculatedRecipe: recipeInput !== null,
    recipesLoading: listEnabled && recipesQuery.isLoading,
    recipes: listEnabled ? (recipesQuery.data ?? null) : [],
  });

  // Until the customer types their own name, the field FOLLOWS the result heading — so a recipe
  // whose flavour/amount changed after this section mounted can never be saved under a stale name.
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const name = nameDraft ?? proposeRecipeTitle(resultTitle);
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saved, setSaved] = useState<'created' | 'version' | null>(null);

  // THE ONE canonical save handler, fed this surface's own payload + target.
  const save = useCanonicalRecipeSave({
    buildInput: () => {
      if (recipeInput === null) throw new Error(c.notCalculated);
      return recipeInput;
    },
    target: state.kind === 'version' ? { recipeId: state.recipeId, title: state.title } : null,
    linkStoreDraft: false,
  });

  if (state.kind === 'hidden') return null;

  const doCreate = async () => {
    if (name.trim() === '') {
      setNameError(c.nameRequired);
      return;
    }
    setNameError(null);
    const ok = await save.createNew(name.trim(), showNote ? note : undefined);
    if (ok) {
      setSaved('created');
      setShowNote(false);
      setNote('');
    }
  };

  const doVersion = async () => {
    const ok = await save.saveVersion(showNote ? note : undefined);
    if (ok) {
      setSaved('version');
      setShowNote(false);
      setNote('');
    }
  };

  const noteField = (
    <div className="mt-3">
      {showNote ? (
        <label className="block">
          <span className="text-[13px] font-medium text-ink">{c.noteLabel}</span>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            data-testid="home-save-note"
            className="mt-2 w-full resize-none rounded-xl border border-ink/15 bg-paper px-4 py-3 text-[15px] text-ink outline-none focus:ring-2 focus:ring-ink focus:ring-offset-2 focus:ring-offset-paper"
          />
        </label>
      ) : (
        <button
          type="button"
          onClick={() => setShowNote(true)}
          className="text-[13px] text-stone-600 underline decoration-stone-300 underline-offset-4 transition-colors hover:text-ink"
        >
          {c.noteToggle}
        </button>
      )}
    </div>
  );

  return (
    // Same card language as the neighbouring Monitor block on the result screen.
    <section
      className="mt-6 rounded-2xl border border-ink/10 bg-ink/[0.02] p-4"
      data-testid="home-save-section"
    >
      <p className="text-[11px] font-semibold text-stone-500">{c.label}</p>
      <p className="mt-2 text-[17px] font-medium text-ink">{c.title}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-stone-500">{c.lead}</p>

      <div className="mt-4 space-y-3">
        {repoState.isLocalDev ? <Line>{c.localMode}</Line> : null}

        {state.kind === 'signin' ? (
          <div className="space-y-3">
            <Line>{c.signIn}</Line>
            <TouchButton size="md" onClick={openAuthModal} data-testid="home-save-signin">
              {c.signInCta}
            </TouchButton>
          </div>
        ) : null}

        {state.kind === 'unavailable' ? <Line>{c.unavailable}</Line> : null}
        {state.kind === 'not_calculated' ? <Line>{c.notCalculated}</Line> : null}
        {state.kind === 'loading' ? <Line>{c.loading}</Line> : null}
        {state.kind === 'blocked' ? <Line>{state.reason}</Line> : null}

        {state.kind === 'create' ? (
          <div>
            <TextField
              label={c.nameLabel}
              placeholder={c.namePlaceholder}
              value={name}
              onChange={(e) => {
                setNameDraft(e.target.value);
                if (nameError) setNameError(null);
                if (saved) setSaved(null);
              }}
              {...(nameError !== null ? { error: nameError } : {})}
              data-testid="home-save-name"
            />
            {noteField}
            <div className="mt-4">
              <TouchButton
                block
                size="lg"
                disabled={save.busy || save.blocked !== null}
                onClick={() => void doCreate()}
                data-testid="home-save-create"
              >
                {save.busy ? c.saving : c.create}
              </TouchButton>
            </div>
          </div>
        ) : null}

        {state.kind === 'version' ? (
          <div>
            {/* The canonical Home rule, stated plainly — with the action that IS allowed. */}
            <p className="text-[15px] text-ink" data-testid="home-save-limit">
              {c.homeLimitTitle(state.title)}
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-stone-600">{c.homeLimitLead}</p>
            {noteField}
            <div className="mt-4">
              <TouchButton
                block
                size="lg"
                disabled={save.busy || save.blocked !== null}
                onClick={() => void doVersion()}
                data-testid="home-save-version"
              >
                {save.busy ? c.saving : c.versionButton(state.nextVersion)}
              </TouchButton>
            </div>
          </div>
        ) : null}

        {/* HONEST failure — the real cause, retryable, and never a "saved" claim. */}
        {save.error ? (
          <p
            role="alert"
            data-testid="home-save-error"
            className={`rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${notice.error} ${notice.text}`}
          >
            {save.error}
          </p>
        ) : null}

        {saved !== null && save.error === null ? (
          <div
            role="status"
            data-testid="home-save-confirmation"
            className={`rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${notice.ideal} ${notice.text}`}
          >
            <p className="font-medium text-ink">
              {saved === 'created' ? c.savedCreated : c.savedVersion}
            </p>
            <Link
              to="/my-recipes"
              className="mt-1 inline-block underline decoration-stone-300 underline-offset-4 transition-colors hover:text-ink"
            >
              {c.openMyRecipes}
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
