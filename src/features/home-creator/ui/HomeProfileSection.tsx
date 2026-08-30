/**
 * §41 — "How do you want to make it?" — shown ONLY when the profile is unknown (§31).
 *
 * §41 is explicit that desktop may use hover for the supplementary line but MOBILE MUST
 * NOT DEPEND ON HOVER. So the hint is always rendered as text under the label; hover
 * adds nothing that is not already readable. That is why there is no `title=` here.
 */
import { HOME_PROFILE_ORDER } from '../homeProfileMapping';
import { homeCreatorCopy } from '../homeCreatorCopy';
import type { IntentProfile } from '../homeIntentParsing';
import { HomeSection } from './HomeSection';

const LABEL: Readonly<Record<IntentProfile, string>> = {
  gelato: homeCreatorCopy.profile.gelato,
  sorbet: homeCreatorCopy.profile.sorbet,
  protein: homeCreatorCopy.profile.protein,
  vegan: homeCreatorCopy.profile.vegan,
};

const HINT: Readonly<Record<IntentProfile, string>> = {
  gelato: homeCreatorCopy.profile.gelatoHint,
  sorbet: homeCreatorCopy.profile.sorbetHint,
  protein: homeCreatorCopy.profile.proteinHint,
  vegan: homeCreatorCopy.profile.veganHint,
};

export function HomeProfileSection({
  selected,
  onSelect,
  onBack,
}: {
  selected: IntentProfile | null;
  onSelect: (profile: IntentProfile) => void;
  onBack?: (() => void) | null;
}) {
  return (
    <HomeSection id="profile" onBack={onBack} data-testid="home-section-profile">
      <h2
        className="text-[22px] leading-tight font-semibold tracking-[-0.015em] sm:text-[26px]"
        style={{ color: 'var(--g-ink)' }}
      >
        {homeCreatorCopy.profile.question}
      </h2>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {HOME_PROFILE_ORDER.map((profile) => {
          const active = selected === profile;
          return (
            <button
              key={profile}
              type="button"
              onClick={() => onSelect(profile)}
              aria-pressed={active}
              data-testid={`home-profile-${profile}`}
              className="flex min-h-[76px] flex-col items-start justify-center rounded-[12px] border px-5 py-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
              style={{
                borderColor: active ? 'var(--g-ink)' : 'var(--g-line)',
                background: active ? 'var(--g-ink)' : '#ffffff',
                color: active ? '#ffffff' : 'var(--g-ink)',
              }}
            >
              <span className="text-[16px] font-semibold">{LABEL[profile]}</span>
              {/* Always-visible hint — mobile must not depend on hover (§41). */}
              <span
                className="mt-0.5 text-[13px]"
                style={{ color: active ? 'rgba(255,255,255,0.72)' : 'var(--g-text-muted)' }}
              >
                {HINT[profile]}
              </span>
            </button>
          );
        })}
      </div>
    </HomeSection>
  );
}
