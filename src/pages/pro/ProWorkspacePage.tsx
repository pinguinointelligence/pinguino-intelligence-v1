/**
 * PINGÜINO Pro workspace (/pro) — S3 canonical Pro shell.
 *
 * ONE professional workspace with persona-gated nav. Reuses the working engine lab
 * (StudioEngineSurface — zero regression) for Receptura and the real, S2 durable-backend
 * RecipeVersionsSection for Wersje. The remaining tabs surface HONEST states: the live
 * durable-backend indicator (ProSliceBackendState, driven by the same resolver the real
 * surface will use) plus a plain "arrives in a later slice" note — never a fake screen.
 *
 * Gating: non-Pro personas see an honest PINGÜINO Pro gate (upsell → /subscription), not a
 * broken workspace. A DEV-only persona switch lets acceptance exercise pro/home/demo without
 * a login. `/studio` stays intact (its demo/free locked previews are unchanged) and cross-links
 * here; the eventual /studio→/pro redirect is deferred to a later slice to avoid regressing
 * the demo/free Studio preview.
 */
import { Link, useSearchParams } from 'react-router';
import { IvoryLogoMark } from '@/components/shared/IvoryLogoMark';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { UpgradePrompt } from '@/components/shared/UpgradePrompt';
import { SurfaceToneContext } from '@/components/ui/surface';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { copy } from '@/copy/en';
import { cn } from '@/lib/cn';
import { AppMenu } from '@/features/shell/AppMenu';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { useAuthStore } from '@/stores/authStore';
import { StudioEngineSurface } from '@/features/studio/StudioEngineSurface';
import { RecipeVersionsSection } from '@/features/pro-core/RecipeVersionsSection';
import { ProSliceBackendState } from '@/features/pro-core/ProSliceBackendState';
import { useProCorePersona } from '@/features/pro-core/useProCorePersona';
import { useProCoreAccessStore } from '@/features/pro-core/proCoreAccessStore';
import { resolveProductionRepository } from '@/features/pro-core/proCoreProductionRepo';
import { resolveCostsRepository } from '@/features/pro-core/proCoreCostsRepo';
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
      {w.devPersona}
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
  // The engine lab keeps its native dark "canvas" tone inside the light workspace
  // (design lock: Monitor Pro / lab surface may be a dark panel).
  return (
    <SurfaceToneContext.Provider value="shell">
      <div className="rounded-lg bg-shell text-ivory [color-scheme:dark]">
        <StudioEngineSurface />
      </div>
    </SurfaceToneContext.Provider>
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
            <button type="button" className={buttonClasses('primary', 'sm')} onClick={openAuthModal}>
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
  return (
    <div className="space-y-4">
      <NoteTab note={w.machineNote} />
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
      return <NoteTab note={w.monitorNote} />;
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
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const activeTab: TabId = isTabId(requested) ? requested : 'recipe';
  const isPro = persona === 'pro';

  const selectTab = (tab: TabId) => {
    const next = new URLSearchParams(params);
    next.set('tab', tab);
    setParams(next, { replace: true });
  };

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
        <div className="flex items-center gap-3">
          <AppMenu />
          <Link to="/" className="flex items-center gap-3">
            <IvoryLogoMark size={22} tone="ink" />
            <span className="text-sm font-light tracking-wordmark">{copy.brand.name}</span>
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <PersonaChip persona={persona} />
          <DevPersonaSwitch persona={persona} />
          <Link
            to="/"
            className="text-sm text-stone-500 underline decoration-ink/25 underline-offset-4 transition-colors hover:text-ink"
          >
            {w.back}
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6">
        <SectionLabel>{w.eyebrow}</SectionLabel>
        <h1 className="mt-1 text-2xl font-light tracking-tight text-ink">{w.title}</h1>
      </div>

      {!isPro ? (
        <main className="mx-auto flex max-w-6xl justify-center px-6 py-16">
          <UpgradePrompt
            message={w.gate.message}
            cta={w.gate.cta}
            onAction={() => {
              window.location.assign('/subscription');
            }}
          />
        </main>
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

          <main
            className="mx-auto max-w-6xl px-6 pb-24 pt-8"
            role="tabpanel"
            data-testid={`pro-panel-${activeTab}`}
          >
            <TabPanel tab={activeTab} persona={persona} />
          </main>
        </>
      )}
    </div>
  );
}
