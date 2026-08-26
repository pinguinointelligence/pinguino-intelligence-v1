import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AppShell } from '@/features/shell/AppShell';
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
    void resolvePartnerPublicLink({ partnerSlug, code: partnerCode, linkSlug }).then((resolution) => {
      if (cancelled) return;
      saveReferralEvidence({ clickId: resolution.clickId, expiresAt: resolution.expiresAt });
      setData(resolution);
      if (resolution.contentLink) navigate(resolution.destinationPath, { replace: true });
    }).catch(() => { if (!cancelled) setNotFound(true); });
    return () => { cancelled = true; };
  }, [invalidRoute, linkSlug, navigate, partnerCode, partnerSlug]);
  if (invalidRoute || notFound) return <AppShell><main className="mx-auto max-w-3xl px-6 py-24"><p className="text-xs uppercase tracking-[0.14em] text-stone-500">404</p><h1 className="mt-3 text-3xl font-semibold text-ink">Link Partnera jest nieaktywny</h1><Link to="/" className="mt-6 inline-block text-sm font-semibold text-ink underline">Przejdź do Gellatti</Link></main></AppShell>;
  if (!data) return <AppShell><main className="mx-auto max-w-3xl px-6 py-24"><p className="text-sm text-stone-500">Sprawdzam bezpieczny link Partnera…</p></main></AppShell>;
  return <AppShell><main className="mx-auto max-w-4xl px-6 py-16 sm:py-24"><div className="grid gap-10 md:grid-cols-[180px_1fr]">{data.profile.logoUrl?<img src={data.profile.logoUrl} alt={`Logo ${data.profile.displayName}`} className="aspect-square w-full border border-ink/10 object-cover"/>:<div className="grid aspect-square w-full place-items-center bg-[#f3ede3] text-4xl font-semibold text-ink" aria-hidden>{data.profile.displayName.slice(0,1).toUpperCase()}</div>}<div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">Gellatti Partner</p><h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em] text-ink">{data.profile.displayName}</h1>{data.profile.shortDescription?<p className="mt-5 max-w-2xl text-base leading-relaxed text-stone-600">{data.profile.shortDescription}</p>:null}<div className="mt-7 flex flex-wrap gap-3"><Link to={data.destinationPath} className="pro-focus-ring inline-flex min-h-11 items-center bg-ink px-5 text-sm font-semibold text-white">Otwórz Gellatti</Link>{data.profile.websiteUrl?<a href={data.profile.websiteUrl} rel="noreferrer" target="_blank" className="pro-focus-ring inline-flex min-h-11 items-center border border-ink/15 px-5 text-sm font-semibold text-ink">Strona Partnera</a>:null}</div><ul className="mt-8 flex flex-wrap gap-x-5 gap-y-3">{Object.entries(data.profile.socialLinks??{}).map(([name,url])=><li key={name}><a href={url} rel="noreferrer" target="_blank" className="text-xs font-semibold capitalize text-ink underline underline-offset-4">{name}</a></li>)}</ul></div></div></main></AppShell>;
}
