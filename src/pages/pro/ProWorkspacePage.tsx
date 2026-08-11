/**
 * PINGÜINO Pro workspace — THE one canonical professional product (owner P0, 2026-07-22;
 * ONE-SCREEN workbench architecture, 2026-07-24).
 *
 * ONE professional workspace with STABLE section URLs: `/pro` (root → the recipe
 * workbench) and `/pro/<section>` for recipe/monitor/versions/production/history/costs/
 * exports/settings/machine — direct link + refresh restore the same section, and legacy
 * `/pro?tab=<id>` deep-links redirect onto the stable paths. `/studio` redirects here.
 *
 * ONE HAMBURGER (owner): the visible tab row is GONE — every former tab destination
 * lives in the canonical AppNavDrawer (appNav.ts keeps all 9 routes + /pro/machine).
 *
 * Receptura/Monitor = the ONE-SCREEN workbench: compact ProWorkbar (≤64 px, name +
 * canonical save + Przelicz z PI + Monitor PI) → compact settings line → ingredient
 * editor (60–65 %) beside the LIVE Monitor PI panel (35–40 %) → thin action bar. On
 * desktop the shell locks to the viewport (`viewportLock`) — the BODY never scrolls
 * during normal editing; the red REVIEW ZONE sits below the fold (intentional scroll).
 * `/pro/monitor` renders the same workbench with the Monitor panel focused.
 *
 * The remaining sections surface HONEST states (ProSliceBackendState + honest notes) —
 * never a fake screen. Non-Pro personas see an honest PINGÜINO Pro gate; a DEV-only
 * persona switch lets acceptance exercise pro/home/demo without a login.
 */
import { useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { UpgradePrompt } from '@/components/shared/UpgradePrompt';
import { SurfaceToneContext } from '@/components/ui/surface';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { copy } from '@/copy/en';
import { cn } from '@/lib/cn';
import { AppShell } from '@/features/shell/AppShell';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { useSessionStore } from '@/stores/sessionStore';
import { StudioEngineSurface, StudioReviewZone } from '@/features/studio/StudioEngineSurface';
import { ProWorkbar } from '@/features/pro-core/ProWorkbar';
import { ProRecalcPanel } from '@/features/pro-core/ProRecalcPanel';
import { ProMachineSelector } from '@/features/pro-core/ProMachineSelector';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { RecipeVersionsSection } from '@/features/pro-core/RecipeVersionsSection';
import { ProSliceBackendState } from '@/features/pro-core/ProSliceBackendState';
import { useProCorePersona } from '@/features/pro-core/useProCorePersona';
import { useProCoreAccessStore } from '@/features/pro-core/proCoreAccessStore';
import { resolveProductionRepository } from '@/features/pro-core/proCoreProductionRepo';
import { resolveCostsRepository } from '@/features/pro-core/proCoreCostsRepo';
import type { ProCorePersona } from '@/features/pro-core/proCoreCapabilities';
import type { ProContextTab } from '@/features/pro-workbench/RecipeProfilePanel';
import { ReviewBadge } from '@/features/design-review/ReviewBadge';
import { OfficialProLogo } from '@/components/shared/OfficialProLogo';
import { useIngredientTableUxStore } from '@/features/ingredient-builder/ingredientTableUxStore';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import { useStudioResult } from '@/features/studio/useStudioResult';
import { useProductionWorkspace } from '@/features/production-workspace/useProductionWorkspace';
import { monitorScoreView } from '@/features/pro-workbench/monitorSummaryView';

const w = copy.proWorkspace;

type TabId = keyof typeof w.tabs;

const TAB_ORDER: TabId[] = [
  'recipe',
  'monitor',
  'versions',
  'production',
  'history',
  'costs',
  'exports',
  'settings',
  'machine',
  'tools',
];

const isTabId = (value: string | null): value is TabId =>
  value !== null && (TAB_ORDER as string[]).includes(value);

/** The four contexts that share the same editor and right-side workspace. */
const isWorkbenchSection = (tab: TabId): tab is ProContextTab =>
  tab === 'recipe' || tab === 'monitor' || tab === 'production';

function PersonaChip({ persona }: { persona: ProCorePersona }) {
  return (
    <span
      className="hidden rounded border border-ink/15 px-2 py-0.5 text-[0.65rem] font-medium tracking-label text-stone-600 uppercase sm:inline-flex"
      data-testid="pro-persona-chip"
    >
      {persona}
    </span>
  );
}

/** DEV-only persona switch — mirrors RecipeVersionsSection so acceptance can reach the Pro
 * view (and the gate) without a real login. Never rendered in a production build. */
function DevPersonaSwitch({ persona }: { persona: ProCorePersona }) {
  const setDevPersona = useProCoreAccessStore((s) => s.setDevPersona);
  const setSessionPlan = useSessionStore((s) => s.setPlan);
  if (!import.meta.env.DEV) return null;
  return (
    <label className="flex items-center gap-2 text-xs text-stone-500">
      <span className="hidden sm:inline">{w.devPersona}</span>
      <select
        className="rounded border border-ink/15 px-2 py-1"
        value={persona}
        onChange={(e) => {
          const next = e.target.value as ProCorePersona;
          setDevPersona(next);
          setSessionPlan(next === 'pro' ? 'pro' : 'demo');
        }}
        data-testid="pro-persona-switch"
      >
        <option value="pro">Pro</option>
        <option value="home">Home</option>
        <option value="demo">Demo</option>
      </select>
    </label>
  );
}

function ProTopActions({
  persona,
  onRecalculate,
  activePanel,
}: {
  persona: ProCorePersona;
  onRecalculate: () => void;
  activePanel: ProContextTab;
}) {
  const dirty = useRecipeStore((state) => state.dirty);
  const directionPending = useRecipeProfileStore((state) => state.awaitingRecalculation);
  const unresolvedRequiredCount = useIngredientTableUxStore(
    (state) => Object.keys(state.unresolvedRequiredByLineId).length,
  );
  const pending = dirty || directionPending;
  const { result, input } = useStudioResult();
  const production = useProductionWorkspace(activePanel === 'production');
  const score =
    activePanel === 'production' ? production.score : monitorScoreView(result, input).match;
  const blocked = activePanel === 'production' || unresolvedRequiredCount > 0;

  return (
    <div
      className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-4"
      data-testid="pro-top-workbar"
    >
      <button
        type="button"
        onClick={onRecalculate}
        disabled={blocked}
        title={
          activePanel === 'production'
            ? 'Przeliczenie receptury jest wyłączone w trybie produkcji.'
            : unresolvedRequiredCount > 0
              ? copy.studio.builder.ingredientTable.infeasible.body
              : pending
                ? 'Zmieniono recepturę lub ustawienia. Przelicz ponownie.'
                : 'Obliczenie jest aktualne.'
        }
        data-testid="pro-workbar-recalc"
        className="h-11 shrink-0 rounded-lg bg-ink px-3 text-xs font-semibold text-white shadow-pro-sm transition-colors hover:bg-ink-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/35 disabled:cursor-not-allowed disabled:bg-status-error/15 disabled:text-status-error sm:px-4 sm:text-sm"
      >
        <span>{activePanel === 'production' ? 'Tryb produkcji' : copy.proWorkbar.recalc}</span>
        <span
          className={cn(
            'ml-2 inline-block size-1.5 rounded-full align-middle',
            pending ? 'bg-gold' : 'bg-status-ideal',
          )}
          aria-label={pending ? 'Oczekuje na przeliczenie' : 'Aktualne'}
          data-testid="pro-recalc-state"
          data-state={pending ? 'pending' : 'current'}
        />
      </button>
      {unresolvedRequiredCount > 0 ? (
        <span
          className="hidden text-[10px] font-semibold tracking-label text-status-error uppercase xl:inline"
          data-testid="pro-recalc-required-block"
        >
          {copy.studio.builder.ingredientTable.infeasible.title}
        </span>
      ) : null}
      <span
        className="flex min-w-0 items-center gap-2 border-l border-ink/10 pl-2 sm:min-w-[4.5rem] sm:pl-3"
        data-testid="pro-top-score"
        aria-label={`${activePanel === 'production' ? 'Przewidywane dopasowanie partii' : 'Dopasowanie techniczne receptury'}: ${score.display}`}
      >
        <span className="font-mono text-lg font-semibold tabular-nums text-ink">
          {score.display}
        </span>
        <span className="hidden max-w-32 text-[10px] leading-tight text-stone-500 xl:block">
          {activePanel === 'production' ? 'Przewidywane dopasowanie partii' : 'Dopasowanie techniczne receptury'}
        </span>
      </span>
      <PersonaChip persona={persona} />
      <DevPersonaSwitch persona={persona} />
    </div>
  );
}

/** The ONE-SCREEN recipe workbench (also serves /pro/monitor with the panel focused). */
function RecipeWorkbench({
  activePanel,
  recalcOpen,
  onOpenRecalc,
  onCloseRecalc,
}: {
  activePanel: ProContextTab;
  recalcOpen: boolean;
  onOpenRecalc: () => void;
  onCloseRecalc: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="pro-viewport-region">
      <SurfaceToneContext.Provider value="paper">
        <div className="flex min-h-0 flex-1 flex-col bg-shell text-ivory">
          <StudioEngineSurface
            key={activePanel}
            activePanel={activePanel}
            recipeBar={<ProWorkbar onOpenPreview={onOpenRecalc} />}
            recalcSlot={<ProRecalcPanel open={recalcOpen} onClose={onCloseRecalc} />}
          />
        </div>
      </SurfaceToneContext.Provider>
    </div>
  );
}

function NoteTab({ note }: { note: string }) {
  return <p className="max-w-2xl text-sm leading-relaxed text-stone-600">{note}</p>;
}

function SettingsTab({ persona }: { persona: ProCorePersona }) {
  const authAvailable = useAuthStore((s) => s.available);
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const openAuthModal = useAuthModalStore((s) => s.open);
  const authed = status === 'authed';

  return (
    <dl className="max-w-md space-y-4">
      <div className="flex items-center justify-between gap-4 border-b border-ink/5 pb-3">
        <dt className="text-xs tracking-label text-stone-600 uppercase">{w.settings.access}</dt>
        <dd>
          <PersonaChip persona={persona} />
        </dd>
      </div>
      <div className="flex items-center justify-between gap-4 border-b border-ink/5 pb-3">
        <dt className="text-xs tracking-label text-stone-600 uppercase">{w.settings.account}</dt>
        <dd className="min-w-0 text-sm text-ink">
          {authed && user?.email ? (
            <span className="truncate" title={user.email}>
              {user.email}
            </span>
          ) : authAvailable ? (
            <button
              type="button"
              className={buttonClasses('primary', 'sm')}
              onClick={openAuthModal}
            >
              {copy.menu.signIn}
            </button>
          ) : (
            <span className="text-stone-500">{w.settings.signedOut}</span>
          )}
        </dd>
      </div>
      <Link
        to="/machine"
        className="inline-block text-sm text-ink underline decoration-ink/25 underline-offset-4 transition-colors hover:text-stone-600"
      >
        {w.openMachine}
      </Link>
    </dl>
  );
}

function MachineTab() {
  // S4: the professional-first machine + serving-mode selector, applied to the current recipe.
  // The full Home machine profile page (default machine, container) stays reachable below.
  return (
    <div className="space-y-8">
      {/* Owner review (RV-13, staging/QA only): per-recipe vs default machine — needs one
          distinguishing sentence on each surface. Customers never see the badge. */}
      <ReviewBadge itemId="RV-13" />
      <ProMachineSelector />
      <Link
        to="/machine"
        className="inline-block text-sm text-ink underline decoration-ink/25 underline-offset-4 transition-colors hover:text-stone-600"
      >
        {w.openMachine}
      </Link>
    </div>
  );
}

/** The NON-workbench sections — a plain titled page under the one hamburger. */
function SectionPanel({ tab, persona }: { tab: TabId; persona: ProCorePersona }) {
  switch (tab) {
    case 'versions':
      return <RecipeVersionsSection />;
    case 'production': {
      const state = resolveProductionRepository();
      return (
        <ProSliceBackendState
          unavailable={state.unavailable}
          isLocalDev={state.isLocalDev}
          note={w.soon.production}
        />
      );
    }
    case 'history':
      return <NoteTab note={w.soon.history} />;
    case 'costs': {
      const state = resolveCostsRepository();
      return (
        <ProSliceBackendState
          unavailable={state.unavailable}
          isLocalDev={state.isLocalDev}
          note={w.soon.costs}
        />
      );
    }
    case 'exports':
      return <NoteTab note={w.soon.exports} />;
    case 'settings':
      return <SettingsTab persona={persona} />;
    case 'machine':
      return <MachineTab />;
    case 'tools':
      return (
        <SurfaceToneContext.Provider value="paper">
          <StudioReviewZone />
        </SurfaceToneContext.Provider>
      );
    default:
      return null;
  }
}

export function ProWorkspacePage() {
  const [recalcOpen, setRecalcOpen] = useState(false);
  const persona = useProCorePersona();
  const { section } = useParams<{ section?: string }>();
  const [searchParams] = useSearchParams();
  const isPro = persona === 'pro';

  // Legacy `/pro?tab=<id>` deep-links → the stable `/pro/<id>` path (replace keeps history clean).
  const legacyTab = searchParams.get('tab');
  if (section === undefined && legacyTab !== null && isTabId(legacyTab)) {
    return <Navigate to={`/pro/${legacyTab}`} replace />;
  }
  // Unknown section → the canonical recipe editor (stable URLs, no fake pages).
  if (section !== undefined && !isTabId(section)) {
    return <Navigate to="/pro/recipe" replace />;
  }

  const activeTab: TabId = isTabId(section ?? null) ? (section as TabId) : 'recipe';
  const workbenchTab = isWorkbenchSection(activeTab) ? activeTab : null;
  const workbench = isPro && workbenchTab !== null;
  const startRecalc = () => {
    if (Object.keys(useIngredientTableUxStore.getState().unresolvedRequiredByLineId).length > 0) {
      return;
    }
    useConstraintStudioStore.getState().createOptimizePreview();
    setRecalcOpen(true);
  };

  return (
    // White precision workspace: presentation-only token remap. The same components,
    // values, content, actions and below-fold review zone remain intact.
    <div
      className={workbench ? 'theme-pro-light lg:h-dvh' : 'theme-pro-light'}
      data-testid="pro-light-scope"
    >
      <AppShell
        viewportLock={workbench}
        maxWidthClass="max-w-none"
        brand={<OfficialProLogo />}
        actions={
          workbench ? (
            <ProTopActions
              persona={persona}
              onRecalculate={startRecalc}
              activePanel={workbenchTab!}
            />
          ) : (
            <>
              <PersonaChip persona={persona} />
              <DevPersonaSwitch persona={persona} />
            </>
          )
        }
      >
        {!isPro ? (
          <>
            <div className="mx-auto max-w-6xl px-6">
              <SectionLabel>{w.eyebrow}</SectionLabel>
              <h1 className="mt-2 text-3xl font-semibold leading-none tracking-[-0.035em] text-ink">
                {w.title}
              </h1>
            </div>
            <div className="mx-auto flex max-w-6xl justify-center px-6 py-16">
              <UpgradePrompt
                message={w.gate.message}
                cta={w.gate.cta}
                onAction={() => {
                  window.location.assign('/subscription');
                }}
              />
            </div>
          </>
        ) : workbench ? (
          // ONE-SCREEN workbench (recipe + monitor): no page heading, no tab row — the
          // viewport belongs to the edit loop; every destination lives in the hamburger.
          <div className="lg:h-full lg:min-h-0" data-testid={`pro-panel-${activeTab}`}>
            <RecipeWorkbench
              activePanel={workbenchTab!}
              recalcOpen={recalcOpen}
              onOpenRecalc={() => setRecalcOpen(true)}
              onCloseRecalc={() => setRecalcOpen(false)}
            />
          </div>
        ) : (
          // Plain titled sections (versions/production/history/costs/exports/settings/machine).
          <>
            <div className="mx-auto max-w-6xl px-6">
              <SectionLabel>{w.eyebrow}</SectionLabel>
              <h1 className="mt-2 text-3xl font-semibold leading-none tracking-[-0.035em] text-ink">
                {w.title} — {w.tabs[activeTab]}
              </h1>
            </div>
            <div
              className="mx-auto max-w-6xl px-6 pb-24 pt-8"
              data-testid={`pro-panel-${activeTab}`}
            >
              <SectionPanel tab={activeTab} persona={persona} />
            </div>
          </>
        )}
      </AppShell>
    </div>
  );
}
