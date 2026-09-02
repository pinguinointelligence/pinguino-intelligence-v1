/**
 * §10/§11 — the header's HOME | PRO segmented switch.
 *
 * The switch changes PRESENTATION ONLY (§14). It navigates; it never touches the
 * recipe. Everything it renders is decided by `homeViewMode`, so the "a HOME
 * subscriber must never see PRO" rule is enforced by the authority, not by a
 * conditional buried in JSX.
 *
 * Treatment (§11): the ACTIVE segment is black with white text, the INACTIVE one is
 * greige with black text — and that reverses when PRO becomes active, which falls out
 * of the rule automatically because it is expressed per-segment. No dots.
 */
import { useNavigate } from 'react-router';
import { cn } from '@/lib/cn';
import {
  proModulePath,
  resolveViewSwitchPresentation,
  segmentAccess,
  segmentTreatment,
  viewSwitchSegments,
  type ActiveViewOrNeutral,
  type HomeViewMode,
  type ViewEntitlement,
} from '../homeViewMode';
import { useHomeViewStore } from '../homeViewStore';
import { homeCreatorCopy } from '../homeCreatorCopy';

const SEGMENT_LABEL: Readonly<Record<HomeViewMode, string>> = {
  home: homeCreatorCopy.switch.home,
  pro: homeCreatorCopy.switch.pro,
};

export function HomeProSwitch({
  entitlement,
  activeView,
  className,
}: {
  entitlement: ViewEntitlement;
  /**
   * `null` on a global destination (Work With Us, Shop): neither segment presents
   * as the current page. Same component, same geometry, same entitlement rules.
   */
  activeView: ActiveViewOrNeutral;
  className?: string;
}) {
  const navigate = useNavigate();
  const lastProModule = useHomeViewStore((state) => state.lastProModule);
  const setView = useHomeViewStore((state) => state.setView);

  const presentation = resolveViewSwitchPresentation(entitlement);
  const segments = viewSwitchSegments();

  // OWNER OVERRIDE 2026-09-01: the switch renders for EVERY audience, so the global
  // header keeps one geometry and one x-coordinate regardless of plan. Visibility is
  // not access — see `go`.
  const go = (segment: HomeViewMode) => {
    if (segmentAccess(segment, presentation) === 'upgrade_required') {
      // The canonical upgrade route, the same one the canonical Save uses when the
      // blocker is `plan`. No entitlement is granted and no PRO content is reached.
      navigate('/subscription');
      return;
    }
    setView(segment);
    // §15: returning to PRO restores the module the user left. HOME goes to `/home`
    // rather than `/` because that says HOME explicitly: `/` is the ambiguous entry
    // the account's default experience answers, so a PRO subscriber sent there was
    // redirected straight back to PRO and never reached HOME.
    navigate(segment === 'pro' ? proModulePath(lastProModule) : '/home');
  };

  return (
    <div
      role="tablist"
      aria-label={homeCreatorCopy.switch.ariaLabel}
      data-testid="home-pro-switch"
      data-neutral={activeView === null ? 'true' : undefined}
      className={cn(
        'inline-flex shrink-0 items-center gap-0 overflow-hidden rounded-full border p-0.5',
        className,
      )}
      style={{ borderColor: 'var(--g-line)', background: 'var(--g-ivory)' }}
    >
      {segments.map((segment) => {
        const treatment = segmentTreatment(segment, activeView);
        const active = treatment === 'active';
        return (
          <button
            key={segment}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={`home-pro-switch-${segment}`}
            data-treatment={treatment}
            onClick={() => go(segment)}
            className={cn(
              'min-h-[32px] rounded-full px-4 text-[11px] font-bold tracking-[0.14em] transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40',
            )}
            style={
              active
                ? { background: 'var(--g-ink)', color: '#ffffff' }
                : { background: 'transparent', color: 'var(--g-ink)' }
            }
          >
            {SEGMENT_LABEL[segment]}
          </button>
        );
      })}
    </div>
  );
}
