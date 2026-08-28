import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApplicationState } from '@/components/shared/ApplicationState';
import { DestinationSurface } from '@/components/shared/DestinationSurface';
import {
  applicationPrimaryClasses,
  applicationSecondaryClasses,
} from '@/components/ui/applicationControlStyles';
import {
  resolvePartnerPublicLink,
  saveReferralEvidence,
  type PartnerPublicResolution,
} from '@/services/partner';

export function PartnerPublicRoute() {
  const params = useParams();
  const partnerSlug = params.partnerSlug ?? params.handle;
  const partnerCode = params.partnerCode ?? params.slug;
  const linkSlug = params.linkSlug;
  const navigate = useNavigate();
  const [data, setData] = useState<PartnerPublicResolution | null>(null);
  const [notFound, setNotFound] = useState(false);
  const invalidRoute = !partnerSlug || !partnerCode || partnerSlug.startsWith('@');
  useEffect(() => {
    let cancelled = false;
    if (invalidRoute || !partnerSlug || !partnerCode) return;
    void resolvePartnerPublicLink({ partnerSlug, code: partnerCode, linkSlug })
      .then((resolution) => {
        if (cancelled) return;
        saveReferralEvidence({ clickId: resolution.clickId, expiresAt: resolution.expiresAt });
        setData(resolution);
        if (resolution.contentLink) navigate(resolution.destinationPath, { replace: true });
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      });
    return () => {
      cancelled = true;
    };
  }, [invalidRoute, linkSlug, navigate, partnerCode, partnerSlug]);

  if (invalidRoute || notFound) {
    return (
      <DestinationSurface eyebrow="404" title="Link Partnera jest nieaktywny">
        <ApplicationState
          kind="empty"
          title="Nie możemy otworzyć tego linku"
          body="Link wygasł, został wyłączony albo jego adres jest niepełny."
          action={
            <Link to="/" className={applicationSecondaryClasses()}>
              Przejdź do Gellatti
            </Link>
          }
        />
      </DestinationSurface>
    );
  }

  if (!data) {
    return (
      <DestinationSurface eyebrow="Gellatti Partner" title="Bezpieczny link Partnera">
        <ApplicationState kind="loading" title="Sprawdzam bezpieczny link Partnera…" />
      </DestinationSurface>
    );
  }

  return (
    <DestinationSurface eyebrow="Gellatti Partner" title={data.profile.displayName}>
      <div className="grid gap-8 md:grid-cols-[180px_minmax(0,1fr)] md:gap-10">
        {data.profile.logoUrl ? (
          <img
            src={data.profile.logoUrl}
            alt={`Logo ${data.profile.displayName}`}
            className="aspect-square w-full rounded-[var(--radius-pro-studio)] border border-ink/10 object-cover"
          />
        ) : (
          <div
            className="grid aspect-square w-full place-items-center rounded-[var(--radius-pro-studio)] border border-ink/10 bg-pro-warm text-4xl font-semibold text-ink"
            aria-hidden="true"
          >
            {data.profile.displayName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          {data.profile.shortDescription ? (
            <p className="max-w-2xl text-base leading-relaxed text-stone-600">
              {data.profile.shortDescription}
            </p>
          ) : null}
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to={data.destinationPath} className={applicationPrimaryClasses()}>
              Otwórz Gellatti
            </Link>
            {data.profile.websiteUrl ? (
              <a
                href={data.profile.websiteUrl}
                rel="noreferrer"
                target="_blank"
                className={applicationSecondaryClasses()}
              >
                Strona Partnera
              </a>
            ) : null}
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-3">
            {Object.entries(data.profile.socialLinks ?? {}).map(([name, url]) => (
              <li key={name}>
                <a
                  href={url}
                  rel="noreferrer"
                  target="_blank"
                  className="pro-focus-ring text-xs font-semibold text-ink capitalize underline decoration-ink/20 underline-offset-4"
                >
                  {name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </DestinationSurface>
  );
}
