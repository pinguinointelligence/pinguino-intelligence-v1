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
import { AppShell } from '@/features/shell/AppShell';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { useAuthStore } from '@/stores/authStore';
import { StudioEngineSurface, StudioReviewZone } from '@/features/studio/StudioEngineSurface';
import { ProWorkbar } from '@/features/pro-core/ProWorkbar';
import { ProRecalcPanel } from '@/features/pro-core/ProRecalcPanel';
import { ProMachineSelector } from '@/features/pro-core/ProMachineSelector';
import { MonitorDrawer } from '@/features/pro-core/MonitorDrawer';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { RecipeVersionsSection } from '@/features/pro-core/RecipeVersionsSection';
import { ProSliceBackendState } from '@/features/pro-core/ProSliceBackendState';
import { useProCorePersona } from '@/features/pro-core/useProCorePersona';
import { useProCoreAccessStore } from '@/features/pro-core/proCoreAccessStore';
import { resolveProductionRepository } from '@/features/pro-core/proCoreProductionRepo';
import { resolveCostsRepository } from '@/features/pro-core/proCoreCostsRepo';
import { ReviewBadge } from '@/features/design-review/ReviewBadge';
import { NonProductionBadge } from '@/features/design-review/NonProductionMarker';
import type { ProCorePersona } from '@/features/pro-core/proCoreCapabilities';

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
];

const isTabId = (value: string | null): value is TabId =>
  value !== null && (TAB_ORDER as string[]).includes(value);

/** The two sections that render the ONE-SCREEN workbench (viewport-locked shell). */
const isWorkbenchSection = (tab: TabId): boolean => tab === 'recipe' || tab === 'monitor';

function PersonaChip({ persona }: { persona: ProCorePersona }) {
  return (
    <span
      className="rounded border border-ink/15 px-2 py-0.5 text-[0.65rem] font-medium tracking-label text-stone-600 uppercase"
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
  if (!import.meta.env.DEV) return null;
  return (
    <label className="flex items-center gap-2 text-xs text-stone-500">
      <span className="hidden sm:inline">{w.devPersona}</span>
      <select
        className="rounded border border-ink/15 px-2 py-1"
        value={persona}
        onChange={(e) => setDevPersona(e.target.value as ProCorePersona)}
        data-testid="pro-persona-switch"
      >
        <option value="pro">Pro</option>
        <option value="home">Home</option>
        <option value="demo">Demo</option>
      </select>
    </label>
  );
}

/** The ONE-SCREEN recipe workbench (also serves /pro/monitor with the panel focused). */
function RecipeWorkbench({ focusMonitor = false }: { focusMonitor?: boolean }) {
  // „Przelicz z PI" INITIATES the real canonical recalculation (owner P0): it stages an
  // optimize preview in the ONE constraint-studio pipeline and opens the compact
  // Preview → Zastosuj/Anuluj → Cofnij OVERLAY. „Monitor PI" opens the bottom-sheet
  // Monitor (mobile); on desktop the LIVE panel is already pinned in the workbench.
  const [monitorOpen, setMonitorOpen] = useState(false);
  const [recalcOpen, setRecalcOpen] = useState(false);
  const startRecalc = () => {
    useConstraintStudioStore.getState().createOptimizePreview();
    setRecalcOpen(true);
  };

  return (
    <>
      {/* ── The viewport-height region: workbar + demo-data marker + workbench. ── */}
      <div className="lg:flex lg:h-full lg:min-h-0 lg:flex-col" data-testid="pro-viewport-region">
        <div className="lg:shrink-0">
          {focusMonitor ? <ReviewBadge itemId="RV-12" /> : null}
          <ProWorkbar onMonitor={() => setMonitorOpen(true)} onRecalc={startRecalc} />
          {/* Agent 4 fixture sweep: the starter recipe is the DEMO preset (milk-base) and the
              ingredient picker serves the demo/reference library — marked pink until the
              verified PI library replaces both paths. Compact single line (owner: the marker
              stays visible, the workbench height budget stays intact). */}
          <div
            className="flex flex-wrap items-center gap-2 border-b border-ink/10 border-l-2 border-l-nonprod bg-nonprod/[0.03] px-4 py-1"
            data-testid="nonprod-marked-pro-demo-library"
          >
            <NonProductionBadge itemId="pro-demo-library" />
            <span className="text-[11px] leading-snug text-stone-600">
              {'Receptura startowa i biblioteka składników to dane demo/referencyjne (wartości literaturowe, koszty szacunkowe).'}
            </span>
          </div>
        </div>

        {/* The engine workbench keeps its native dark tone (Masterpiece Phase 5). */}
        <SurfaceToneContext.Provider value="shell">
          <div className="bg-shell text-ivory [color-scheme:dark] lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
            <StudioEngineSurface
              focusMonitor={focusMonitor}
              onOpenRecalcPanel={() => setRecalcOpen(true)}
              recalcSlot={<ProRecalcPanel open={recalcOpen} onClose={() => setRecalcOpen(false)} />}
            />
          </div>
        </SurfaceToneContext.Provider>
      </div>

      {/* ── BELOW the fold: the red review zone (intentional scroll only). ── */}
      <SurfaceToneContext.Provider value="shell">
        <div className="bg-shell text-ivory [color-scheme:dark]">
          <StudioReviewZone />
        </div>
      </SurfaceToneContext.Provider>

      {/* Mobile bottom sheet — the SAME complete Monitor content as the desktop panel. */}
      <MonitorDrawer open={monitorOpen} onClose={() => setMonitorOpen(false)} />
    </>
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
        <dt className="text-xs tracking-label text-stone-400 uppercase">{w.settings.access}</dt>
        <dd>
          <PersonaChip persona={persona} />
        </dd>
      </div>
      <div className="flex items-center justify-between gap-4 border-b border-ink/5 pb-3">
        <dt className="text-xs tracking-label text-stone-400 uppercase">{w.settings.account}</dt>
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
        to="/profile/machine"
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
        to="/profile/machine"
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
    default:
      return null;
  }
}

export function ProWorkspacePage() {
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
  const workbench = isPro && isWorkbenchSection(activeTab);

  return (
    // Masterpiece Phase 5 — the canonical Pro workspace wears the DARK PROFESSIONAL identity:
    // one token scope flips the whole chrome to deep graphite + brand-ivory actions.
    // Presentation only: same components, same tokens, same behavior; light routes untouched.
    <div className={workbench ? 'theme-pro-dark lg:h-dvh' : 'theme-pro-dark'} data-testid="pro-dark-scope">
      <AppShell
        viewportLock={workbench}
        actions={
          <>
            <PersonaChip persona={persona} />
            <DevPersonaSwitch persona={persona} />
          </>
        }
      >
        {!isPro ? (
          <>
            <div className="mx-auto max-w-6xl px-6">
              <SectionLabel>{w.eyebrow}</SectionLabel>
              <h1 className="mt-1 text-2xl font-light tracking-tight text-ink">{w.title}</h1>
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
            <RecipeWorkbench focusMonitor={activeTab === 'monitor'} />
          </div>
        ) : (
          // Plain titled sections (versions/production/history/costs/exports/settings/machine).
          <>
            <div className="mx-auto max-w-6xl px-6">
              <SectionLabel>{w.eyebrow}</SectionLabel>
              <h1 className="mt-1 text-2xl font-light tracking-tight text-ink">
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
