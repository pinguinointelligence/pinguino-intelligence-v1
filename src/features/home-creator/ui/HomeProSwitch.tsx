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
import { requestLeave } from '@/features/production-area/unsavedGuard';

/**
 * The switch's hairline. DESIGN V3.0 correction VII names it exactly (#ebe6dd) and lists
 * „delikatność linii" among the things that change, so it is one step lighter than the
 * general `--g-line` (#ded9d0). Hairlines of this kind are already written as literals in
 * this codebase (e.g. the #efebe4 rules under the header).
 */
const SWITCH_LINE = '#ebe6dd';

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
  // Produkcja v3 §1.5: switching away from a half-edited area form (machine settings,
  // product markets, label settings) asks first; with nothing unsaved it switches at once.
  const go = (segment: HomeViewMode) =>
    requestLeave(() => {
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
    });

  return (
    <div
      role="tablist"
      aria-label={homeCreatorCopy.switch.ariaLabel}
      data-testid="home-pro-switch"
      data-neutral={activeView === null ? 'true' : undefined}
      className={cn(
        /* DESIGN V3.0 correction VII — the capsule is 28 px on phone and 30 px from `sm`,
           measured the way the design measures it: 1 px border + 2 px padding + the
           segment. `overflow-hidden` is deliberately gone — it used to clip the invisible
           vertical extension that gives each segment its 44 px touch target, and it never
           had anything to clip: both segments are `rounded-full` themselves. */
        'inline-flex shrink-0 items-center gap-0 rounded-full border p-0.5',
        className,
      )}
      style={{ borderColor: SWITCH_LINE, background: 'var(--g-ivory)' }}
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
              /* DESIGN V3.0 correction VII, „Kierunek HOME/PRO (zaakceptowany)": the switch
                 comes down to the scale of the account button. Phone: segment 22 px, 10 px
                 at 600, 0.06 em, 8 px sides. From `sm` (iPad and desktop): segment 24 px,
                 10.5 px at 600, 0.07 em, 10 px sides. The desktop switch this replaces was
                 38 px tall with bold 11 px at 0.14 em — the geometry the design cites as
                 the old one. Both options, the black active segment and the behaviour are
                 unchanged; only size, weight, spacing and the line's delicacy move. */
              'h-[22px] px-2 text-[10px] tracking-[0.06em]',
              'sm:h-[24px] sm:px-2.5 sm:text-[10.5px] sm:tracking-[0.07em]',
              'rounded-full font-semibold transition-colors',
              /* A 22/24 px segment is below the 44 px a thumb needs, so each segment
                 carries an INVISIBLE vertical extension: 22 + 11 + 11 and 24 + 10 + 10
                 both land on exactly 44 px. Nothing is painted — the capsule keeps its
                 size, and the header does not grow. */
              'relative',
              "after:absolute after:inset-x-0 after:-inset-y-[11px] after:content-['']",
              'sm:after:-inset-y-[10px]',
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
