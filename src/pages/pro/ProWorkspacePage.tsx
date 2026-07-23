/**
 * PINGÜINO Pro workspace — THE one canonical professional product (owner P0, 2026-07-22).
 *
 * ONE professional workspace with persona-gated nav and STABLE section URLs:
 * `/pro` (root → the recipe editor) and `/pro/<section>` for recipe/monitor/versions/production/
 * history/costs/exports/settings — direct link + refresh restore the same section, and legacy
 * `/pro?tab=<id>` deep-links redirect onto the stable paths. `/studio` redirects here (there is
 * no separate Studio product).
 *
 * Receptura = the canonical recipe workspace: sticky ProWorkbar (name + canonical save +
 * Przelicz z PI → real Preview→Zastosuj→Cofnij + Monitor PI) above the engine lab surface.
 * The remaining sections surface HONEST states (ProSliceBackendState + honest notes) — never a
 * fake screen. Non-Pro personas see an honest PINGÜINO Pro gate; a DEV-only persona switch lets
 * acceptance exercise pro/home/demo without a login.
 */
import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { UpgradePrompt } from '@/components/shared/UpgradePrompt';
import { SurfaceToneContext } from '@/components/ui/surface';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { copy } from '@/copy/en';
import { cn } from '@/lib/cn';
import { AppShell } from '@/features/shell/AppShell';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { useAuthStore } from '@/stores/authStore';
import { StudioEngineSurface } from '@/features/studio/StudioEngineSurface';
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

function RecipeTab() {
  // Sticky top workbar (name + canonical save + context + version/status + Monitor PI + Przelicz z PI)
  // above the engine lab. „Przelicz z PI" INITIATES the real canonical recalculation (owner P0):
  // it stages an optimize preview in the ONE constraint-studio pipeline and opens the top-level
  // Preview → Zastosuj/Anuluj → Cofnij panel right under the workbar. „Monitor PI" opens the
  // Monitor drawer on the LIVE result.
  const [monitorOpen, setMonitorOpen] = useState(false);
  const [recalcOpen, setRecalcOpen] = useState(false);
  const startRecalc = () => {
    useConstraintStudioStore.getState().createOptimizePreview();
    setRecalcOpen(true);
  };
  return (
    <div>
      <ProWorkbar onMonitor={() => setMonitorOpen(true)} onRecalc={startRecalc} />
      <ProRecalcPanel open={recalcOpen} onClose={() => setRecalcOpen(false)} />
      {/* The engine lab keeps its native dark "canvas" tone; inside the dark professional
          workspace (Masterpiece Phase 5) the shell tone reads as a slightly ELEVATED surface —
          a hairline carries the elevation, no card-in-card chrome. */}
      <SurfaceToneContext.Provider value="shell">
        <div className="mt-4 rounded-lg border border-shell-line bg-shell text-ivory [color-scheme:dark]">
          <StudioEngineSurface />
        </div>
      </SurfaceToneContext.Provider>
      <MonitorDrawer open={monitorOpen} onClose={() => setMonitorOpen(false)} />
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

function TabPanel({ tab, persona }: { tab: TabId; persona: ProCorePersona }) {
  switch (tab) {
    case 'recipe':
      return <RecipeTab />;
    case 'monitor':
      return (
        <div className="space-y-3">
          {/* Owner review (RV-12, staging/QA only): a note-only section — proposal: open the
              Monitor drawer directly. Customers never see the badge. */}
          <ReviewBadge itemId="RV-12" />
          <NoteTab note={w.monitorNote} />
        </div>
      );
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
  const navigate = useNavigate();
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

  const selectTab = (tab: TabId) => navigate(`/pro/${tab}`);

  return (
    // Masterpiece Phase 5 — the canonical Pro workspace wears the DARK PROFESSIONAL identity:
    // one token scope flips the whole chrome (header, workbar, tabs, panels) to deep graphite +
    // brand-ivory actions, so the engine lab stops being a dark island inside light chrome.
    // Presentation only: same components, same tokens, same behavior; light routes untouched.
    <div className="theme-pro-dark" data-testid="pro-dark-scope">
      <AppShell
        actions={
          <>
            <PersonaChip persona={persona} />
            <DevPersonaSwitch persona={persona} />
          </>
        }
      >
        <div className="mx-auto max-w-6xl px-6">
          <SectionLabel>{w.eyebrow}</SectionLabel>
          <h1 className="mt-1 text-2xl font-light tracking-tight text-ink">{w.title}</h1>
        </div>

        {!isPro ? (
          <div className="mx-auto flex max-w-6xl justify-center px-6 py-16">
            <UpgradePrompt
              message={w.gate.message}
              cta={w.gate.cta}
              onAction={() => {
                window.location.assign('/subscription');
              }}
            />
          </div>
        ) : (
          <>
            <nav
              className="mx-auto mt-6 max-w-6xl overflow-x-auto border-b border-ink/10 px-6"
              role="tablist"
              aria-label={w.title}
            >
              <div className="flex min-w-max gap-1">
                {TAB_ORDER.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={tab === activeTab}
                    onClick={() => selectTab(tab)}
                    data-testid={`pro-tab-${tab}`}
                    className={cn(
                      '-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors',
                      tab === activeTab
                        ? 'border-ink font-medium text-ink'
                        : 'border-transparent text-stone-500 hover:text-ink',
                    )}
                  >
                    {w.tabs[tab]}
                  </button>
                ))}
              </div>
            </nav>

            <div
              className="mx-auto max-w-6xl px-6 pb-24 pt-8"
              role="tabpanel"
              data-testid={`pro-panel-${activeTab}`}
            >
              <TabPanel tab={activeTab} persona={persona} />
            </div>
          </>
        )}
      </AppShell>
    </div>
  );
}
