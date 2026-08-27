import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { DestinationSurface } from '@/components/shared/DestinationSurface';
import { Button } from '@/components/ui/Button';
import { customerErrorMessage } from '@/copy/customerError';
import { cn } from '@/lib/cn';
import {
  createPartnerContentLink,
  getPartnerWorkspace,
  managePartnerCode,
  startConnectOnboarding,
  updatePartnerProfile,
  uploadPartnerLogo,
  type PartnerCodeAnalytics,
  type PartnerWorkspace,
} from '@/services/partner';

const sections = [
  ['overview', 'Podsumowanie'],
  ['codes', 'Moje kody'],
  ['generator', 'Generator linków'],
  ['content', 'Treści i linki'],
  ['earnings', 'Prowizje'],
  ['payouts', 'Wypłaty'],
  ['profile', 'Profil publiczny'],
  ['settings', 'Ustawienia'],
] as const;
type Section = (typeof sections)[number][0];

const money = (value: unknown, currency = 'EUR') =>
  new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency,
  }).format(Number(value ?? 0) / 100);

function Heading({ title, detail }: { title: string; detail: string }) {
  return (
    <header className="border-b border-ink/10 pb-5">
      <h2 className="text-2xl font-semibold tracking-[-0.035em] text-ink">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-stone-600">{detail}</p>
    </header>
  );
}

function Overview({ data }: { data: PartnerWorkspace }) {
  const codes = data.codes ?? [];
  const activeCodes = codes.filter((code) => code.status === 'active');
  const totals = codes.reduce(
    (sum, code) => ({
      clicks: sum.clicks + Number(code.clickCount),
      signups: sum.signups + Number(code.signups),
      paid: sum.paid + Number(code.paidCustomers),
      commission:
        sum.commission +
        Number(code.pendingCommissionCents) +
        Number(code.approvedCommissionCents) +
        Number(code.paidCommissionCents),
    }),
    { clicks: 0, signups: 0, paid: 0, commission: 0 },
  );
  return (
    <>
      <Heading
        title="Podsumowanie Partnera"
        detail="Ruch, konwersje i rozliczenia pochodzą z zapisanej historii poleceń, prowizji i wypłat. Twórca i Partner pozostają osobnymi rolami."
      />
      <dl className="mt-7 grid gap-px border border-ink/10 bg-ink/10 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Aktywne kody', `${activeCodes.length} / 3`],
          ['Kliknięcia', totals.clicks],
          ['Płatni klienci', totals.paid],
          ['Prowizja łącznie', money(totals.commission)],
        ].map(([label, value]) => (
          <div key={label} className="bg-white p-5">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">
              {label}
            </dt>
            <dd className="mt-3 text-3xl font-medium tabular-nums text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-7 grid gap-5 lg:grid-cols-2">
        <div className="border border-ink/10 p-5">
          <h3 className="text-sm font-semibold text-ink">Przypisania</h3>
          <p className="mt-3 text-sm text-stone-600">
            {totals.signups} rejestracji · {totals.paid} płatnych klientów
          </p>
          <p className="mt-2 text-xs leading-relaxed text-stone-500">
            Pierwsza kwalifikowana płatność blokuje właściciela atrybucji. Zwroty tworzą korekty;
            historia nie jest przepisywana.
          </p>
        </div>
        <div className="border border-ink/10 p-5">
          <h3 className="text-sm font-semibold text-ink">Konto wypłat Connect</h3>
          <p className="mt-3 text-sm text-stone-600">
            {data.partner?.payoutsEnabled
              ? 'Wypłaty aktywne'
              : data.partner?.connectAccountPresent
                ? 'Dokończ onboarding wypłat'
                : 'Konto Connect oczekuje na przygotowanie przez Admina'}
          </p>
        </div>
      </div>
    </>
  );
}

function Codes({ data }: { data: PartnerWorkspace }) {
  const queryClient = useQueryClient();
  const codes = data.codes ?? [];
  const active = codes.filter((code) => code.status === 'active');
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const mutation = useMutation({
    mutationFn: () => managePartnerCode({ action: 'CREATE', code, label }),
    onSuccess: async () => {
      setCode('');
      setLabel('');
      await queryClient.invalidateQueries({ queryKey: ['partner-workspace'] });
    },
  });
  const archive = useMutation({
    mutationFn: (id: string) => managePartnerCode({ action: 'ARCHIVE', codeId: id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['partner-workspace'] }),
  });
  return (
    <>
      <Heading
        title="Moje kody"
        detail="Maksymalnie 3 aktywne kanały. Archiwizacja zachowuje wszystkie kliknięcia, sprzedaże i prowizje; dawny kod nigdy nie trafia do innego Partnera."
      />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
        className="mt-6 grid gap-3 border border-ink/10 bg-[#f3ede3] p-5 sm:grid-cols-[1fr_1fr_auto]"
      >
        <label className="text-xs font-semibold text-ink">
          Kod
          <input
            value={code}
            onChange={(event) => setCode(event.currentTarget.value.toLowerCase())}
            placeholder="kasia1234"
            className="pro-focus-ring mt-2 min-h-11 w-full border border-ink/15 bg-white px-3 font-mono text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-ink">
          Wewnętrzna etykieta
          <input
            value={label}
            onChange={(event) => setLabel(event.currentTarget.value)}
            placeholder="Instagram lato"
            className="pro-focus-ring mt-2 min-h-11 w-full border border-ink/15 bg-white px-3 text-sm"
          />
        </label>
        <Button
          type="submit"
          className="self-end"
          disabled={active.length >= 3 || mutation.isPending}
        >
          Utwórz kod
        </Button>
      </form>
      {active.length >= 3 ? (
        <p className="mt-3 text-xs text-stone-600">
          Limit 3 aktywnych kodów osiągnięty. Zarchiwizuj jeden, aby utworzyć kolejny.
        </p>
      ) : null}
      {mutation.isError ? (
        <p className="mt-3 text-xs text-status-error">
          {customerErrorMessage(mutation.error, 'partner')}
        </p>
      ) : null}
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-y border-ink/15 bg-stone-50 text-[10px] uppercase tracking-[0.1em] text-stone-500">
              {[
                'Kod / kanał',
                'Status',
                'Kliknięcia',
                'Unikalni',
                'Rejestracje',
                'Klienci',
                'Przychód brutto',
                'Zwroty',
                'Prowizja oczekująca',
                'Zatwierdzona',
                'Wypłacona',
                '',
              ].map((h) => (
                <th key={h} className="px-3 py-3 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {codes.map((item) => (
              <CodeRow key={item.id} item={item} onArchive={() => archive.mutate(item.id)} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CodeRow({ item, onArchive }: { item: PartnerCodeAnalytics; onArchive: () => void }) {
  return (
    <tr className="border-b border-ink/10">
      <td className="px-3 py-4">
        <strong className="font-mono text-ink">{item.code}</strong>
        <span className="mt-1 block text-[10px] text-stone-500">
          {item.label ?? 'bez etykiety'}
        </span>
      </td>
      <td className="px-3 py-4">{item.status}</td>
      <td className="px-3 py-4 tabular-nums">{item.clickCount}</td>
      <td className="px-3 py-4 tabular-nums">{item.uniqueVisitors}</td>
      <td className="px-3 py-4 tabular-nums">{item.signups}</td>
      <td className="px-3 py-4 tabular-nums">{item.paidCustomers}</td>
      <td className="px-3 py-4 tabular-nums">{money(item.grossAttributedRevenueCents)}</td>
      <td className="px-3 py-4 tabular-nums">{money(item.refundCommissionCents)}</td>
      <td className="px-3 py-4 tabular-nums">{money(item.pendingCommissionCents)}</td>
      <td className="px-3 py-4 tabular-nums">{money(item.approvedCommissionCents)}</td>
      <td className="px-3 py-4 tabular-nums">{money(item.paidCommissionCents)}</td>
      <td className="px-3 py-4">
        {item.status === 'active' ? (
          <button
            type="button"
            onClick={onArchive}
            className="pro-focus-ring min-h-10 text-xs font-semibold text-ink underline underline-offset-4"
          >
            Archiwizuj
          </button>
        ) : null}
      </td>
    </tr>
  );
}

function LinkGenerator({ data }: { data: PartnerWorkspace }) {
  const active = (data.codes ?? []).filter((code) => code.status === 'active');
  const profile = data.profile;
  const qc = useQueryClient();
  const [codeId, setCodeId] = useState(active[0]?.id ?? '');
  const [type, setType] = useState('PRICING');
  const [path, setPath] = useState('/subscription');
  const [label, setLabel] = useState('');
  const [created, setCreated] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      createPartnerContentLink({ codeId, destinationType: type, destinationPath: path, label }),
    onSuccess: async (result) => {
      const code = active.find((item) => item.id === codeId);
      setCreated(
        code && profile
          ? `${window.location.origin}/${profile.slug}/${code.slug}/l/${result.linkSlug}`
          : null,
      );
      await qc.invalidateQueries({ queryKey: ['partner-workspace'] });
    },
  });
  return (
    <>
      <Heading
        title="Generator linków"
        detail="Cel musi być zatwierdzoną stroną Gellatti. Nie można wpisać zewnętrznego przekierowania; link pozostaje związany z jednym z trzech kanałów."
      />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
        className="mt-6 grid gap-4 border border-ink/10 p-5 md:grid-cols-2"
      >
        <label className="text-xs font-semibold">
          Kod
          <select
            value={codeId}
            onChange={(e) => setCodeId(e.currentTarget.value)}
            className="pro-focus-ring mt-2 min-h-11 w-full border border-ink/15 bg-white px-3 text-sm"
          >
            {active.map((code) => (
              <option key={code.id} value={code.id}>
                {code.code} · {code.label ?? 'kanał'}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold">
          Typ celu
          <select
            value={type}
            onChange={(e) => {
              setType(e.currentTarget.value);
              if (e.currentTarget.value === 'PRICING') setPath('/subscription');
              if (e.currentTarget.value === 'PUBLIC_PROFILE') setPath('/partner');
              if (e.currentTarget.value === 'PUBLIC_PAGE') setPath('/community');
            }}
            className="pro-focus-ring mt-2 min-h-11 w-full border border-ink/15 bg-white px-3 text-sm"
          >
            <option value="PRICING">Cennik</option>
            <option value="COMMUNITY_RECIPE">Receptura Community</option>
            <option value="SHARED_RECIPE">Udostępniona receptura</option>
            <option value="PUBLIC_PAGE">Publiczna strona</option>
            <option value="PUBLIC_PROFILE">Profil Partnera</option>
          </select>
        </label>
        <label className="text-xs font-semibold">
          Ścieżka Gellatti
          <input
            value={path}
            onChange={(e) => setPath(e.currentTarget.value)}
            placeholder="/@tworca/receptura"
            className="pro-focus-ring mt-2 min-h-11 w-full border border-ink/15 px-3 font-mono text-sm"
          />
        </label>
        <label className="text-xs font-semibold">
          Etykieta linku
          <input
            value={label}
            onChange={(e) => setLabel(e.currentTarget.value)}
            placeholder="Receptura pistacjowa"
            className="pro-focus-ring mt-2 min-h-11 w-full border border-ink/15 px-3 text-sm"
          />
        </label>
        <Button type="submit" disabled={!codeId || mutation.isPending}>
          Generuj bezpieczny link
        </Button>
      </form>
      {created ? (
        <div className="mt-4 border border-status-ideal/30 bg-status-ideal/5 p-4">
          <p className="text-xs text-stone-500">Gotowy link</p>
          <a href={created} className="mt-1 block break-all font-mono text-sm text-ink underline">
            {created}
          </a>
        </div>
      ) : null}
      {mutation.isError ? (
        <p className="mt-3 text-xs text-status-error">
          {customerErrorMessage(mutation.error, 'partner')}
        </p>
      ) : null}
    </>
  );
}

function ContentLinks({ data }: { data: PartnerWorkspace }) {
  const profile = data.profile;
  const codes = data.codes ?? [];
  return (
    <>
      <Heading
        title="Treści i udostępnione linki"
        detail="Każdy link prowadzi tylko do zaakceptowanego celu wewnątrz Gellatti i zachowuje kanał atrybucji."
      />
      <div className="mt-6 divide-y divide-ink/10 border-y border-ink/10">
        {(data.links ?? []).map((link) => {
          const code = codes.find((item) => item.id === String(link.partnerCodeId));
          const href =
            profile && code ? `/${profile.slug}/${code.slug}/l/${String(link.linkSlug)}` : '#';
          return (
            <article key={String(link.id)} className="grid gap-3 py-4 md:grid-cols-[1fr_auto]">
              <div>
                <strong className="text-sm text-ink">
                  {String(link.label ?? link.destinationPath)}
                </strong>
                <p className="mt-1 font-mono text-[10px] text-stone-500">
                  {href} → {String(link.destinationPath)}
                </p>
              </div>
              <div className="text-right text-xs text-stone-600">
                {String(link.status)} · {String(link.clickCount)} kliknięć
              </div>
            </article>
          );
        })}
        {(data.links?.length ?? 0) === 0 ? (
          <p className="py-5 text-sm text-stone-500">Brak wygenerowanych linków.</p>
        ) : null}
      </div>
    </>
  );
}

function Earnings({ data }: { data: PartnerWorkspace }) {
  return (
    <>
      <Heading
        title="Prowizje"
        detail="Kwoty pochodzą z zapisanej historii prowizji. Stawka i jej wersja są utrwalane w chwili naliczenia."
      />
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead>
            <tr className="border-y border-ink/15 bg-stone-50">
              {['Data', 'Plan', 'Cykl', 'Status', 'Kwota', 'Środowisko', 'Invoice'].map((h) => (
                <th key={h} className="px-3 py-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data.commissions ?? []).map((row) => (
              <tr key={String(row.id)} className="border-b border-ink/10">
                <td className="px-3 py-4">
                  {new Date(String(row.earnedAt)).toLocaleDateString('pl-PL')}
                </td>
                <td className="px-3 py-4">{String(row.product)}</td>
                <td className="px-3 py-4">{String(row.cadence)}</td>
                <td className="px-3 py-4">{String(row.status)}</td>
                <td className="px-3 py-4 tabular-nums">
                  {money(row.amountCents, String(row.currency ?? 'EUR'))}
                </td>
                <td className="px-3 py-4">{row.livemode ? 'LIVE' : 'TEST'}</td>
                <td className="px-3 py-4 font-mono text-[10px]">{String(row.invoiceId ?? '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Payouts({ data }: { data: PartnerWorkspace }) {
  const connect = useMutation({
    mutationFn: startConnectOnboarding,
    onSuccess: (url) => window.location.assign(url),
  });
  return (
    <>
      <Heading
        title="Wypłaty"
        detail="Wypłaty korzystają wyłącznie z konta Connect i zapisanych partii rozliczeń."
      />
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border border-ink/10 bg-[#f3ede3] p-5">
        <div>
          <strong className="text-sm text-ink">Konto Connect</strong>
          <p className="mt-1 text-xs text-stone-600">
            {data.partner?.payoutsEnabled
              ? 'Wypłaty włączone'
              : data.partner?.connectAccountPresent
                ? 'Onboarding wymaga ukończenia'
                : 'Admin musi najpierw przygotować konto Connect'}
          </p>
        </div>
        {data.partner?.connectAccountPresent && !data.partner.payoutsEnabled ? (
          <Button onClick={() => connect.mutate()}>Dokończ konfigurację</Button>
        ) : null}
      </div>
      <div className="mt-6 divide-y divide-ink/10 border-y border-ink/10">
        {(data.payouts ?? []).map((row) => (
          <article key={String(row.id)} className="grid gap-3 py-4 sm:grid-cols-4">
            <div>
              <span className="text-[10px] uppercase text-stone-500">Kwota</span>
              <strong className="mt-1 block text-sm">
                {money(row.amountCents, String(row.currency ?? 'EUR'))}
              </strong>
            </div>
            <div>
              <span className="text-[10px] uppercase text-stone-500">Status</span>
              <p className="mt-1 text-sm">{String(row.status)}</p>
            </div>
            <div>
              <span className="text-[10px] uppercase text-stone-500">Przeniesienie</span>
              <p className="mt-1 text-sm">
                {money(row.carryForwardCents, String(row.currency ?? 'EUR'))}
              </p>
            </div>
            <div>
              <span className="text-[10px] uppercase text-stone-500">Data</span>
              <p className="mt-1 text-sm">
                {new Date(String(row.createdAt)).toLocaleDateString('pl-PL')}
              </p>
            </div>
          </article>
        ))}
      </div>
      {connect.isError ? (
        <p className="mt-3 text-xs text-status-error">
          {customerErrorMessage(connect.error, 'partner')}
        </p>
      ) : null}
    </>
  );
}

function Profile({ data }: { data: PartnerWorkspace }) {
  const qc = useQueryClient();
  const profile = data.profile;
  const [form, setForm] = useState({
    displayName: profile?.displayName ?? '',
    shortDescription: profile?.shortDescription ?? '',
    websiteUrl: profile?.websiteUrl ?? '',
    defaultDestinationPath: profile?.defaultDestinationPath ?? '/subscription',
    instagram: profile?.socialLinks.instagram ?? '',
    tiktok: profile?.socialLinks.tiktok ?? '',
    facebook: profile?.socialLinks.facebook ?? '',
    youtube: profile?.socialLinks.youtube ?? '',
    x: profile?.socialLinks.x ?? '',
    pinterest: profile?.socialLinks.pinterest ?? '',
  });
  const socialKeys = ['instagram', 'tiktok', 'facebook', 'youtube', 'x', 'pinterest'] as const;
  const save = useMutation({
    mutationFn: () =>
      updatePartnerProfile({
        displayName: form.displayName,
        shortDescription: form.shortDescription,
        websiteUrl: form.websiteUrl,
        socialLinks: Object.fromEntries(
          socialKeys.filter((key) => Boolean(form[key])).map((key) => [key, form[key]]),
        ),
        defaultDestinationPath: form.defaultDestinationPath,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partner-workspace'] }),
  });
  const logo = useMutation({
    mutationFn: uploadPartnerLogo,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partner-workspace'] }),
  });
  return (
    <>
      <Heading
        title="Profil publiczny"
        detail="Publiczne są wyłącznie zatwierdzone pola. Linki muszą używać HTTPS, a logo przechodzi kontrolę typu, rozmiaru, wymiarów i moderacji."
      />
      <p className="mt-4 font-mono text-xs text-stone-500">/{profile?.slug}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="mt-6 grid gap-4 md:grid-cols-2"
      >
        {[
          ['displayName', 'Nazwa publiczna'],
          ['websiteUrl', 'Website HTTPS'],
          ['instagram', 'Instagram'],
          ['tiktok', 'TikTok'],
          ['facebook', 'Facebook'],
          ['youtube', 'YouTube'],
          ['x', 'X'],
          ['pinterest', 'Pinterest'],
          ['defaultDestinationPath', 'Domyślna ścieżka Gellatti'],
        ].map(([key, label]) => (
          <label key={key} className="text-xs font-semibold text-ink">
            {label}
            <input
              value={form[String(key) as keyof typeof form]}
              onChange={(e) => setForm({ ...form, [String(key)]: e.currentTarget.value })}
              className="pro-focus-ring mt-2 min-h-11 w-full border border-ink/15 px-3 text-sm"
            />
          </label>
        ))}
        <label className="text-xs font-semibold text-ink md:col-span-2">
          Krótki opis
          <textarea
            value={form.shortDescription}
            maxLength={500}
            rows={4}
            onChange={(e) => setForm({ ...form, shortDescription: e.currentTarget.value })}
            className="pro-focus-ring mt-2 w-full border border-ink/15 px-3 py-2 text-sm"
          />
        </label>
        <Button type="submit" disabled={save.isPending}>
          Zapisz profil
        </Button>
      </form>
      <div className="mt-7 border-t border-ink/10 pt-6">
        <label className="text-xs font-semibold text-ink">
          Logo JPG/PNG/WEBP · do 2 MB · 128–2000 px
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (file) logo.mutate(file);
            }}
            className="pro-focus-ring mt-2 block min-h-11 w-full max-w-xl border border-ink/15 px-3 py-2 text-xs"
          />
        </label>
        <p className="mt-2 text-xs text-stone-500">
          Status profilu: {profile?.moderationStatus ?? '—'}
        </p>
      </div>
      {save.isError || logo.isError ? (
        <p className="mt-3 text-xs text-status-error">
          {customerErrorMessage(save.error ?? logo.error, 'partner')}
        </p>
      ) : null}
    </>
  );
}

function Settings({ data }: { data: PartnerWorkspace }) {
  return (
    <>
      <Heading
        title="Ustawienia"
        detail="Tożsamość Partnera, status i zasady finansowe są kontrolowane przez Admina. Zmiany konta nie przepisują historii atrybucji."
      />
      <dl className="mt-6 divide-y divide-ink/10 border-y border-ink/10">
        {[
          ['Partner ID', data.partner?.id],
          ['Status', data.partner?.status],
          ['Tier', data.partner?.tier],
          ['Public slug', data.profile?.slug],
          ['Home + Pro', 'Bez opłat podczas aktywnego statusu Partner'],
        ].map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 py-4 text-sm">
            <dt className="text-stone-500">{label}</dt>
            <dd className="text-right font-medium text-ink">{value ?? '—'}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

export function PartnerPage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('section');
  const section: Section = sections.some(([id]) => id === requested)
    ? (requested as Section)
    : 'overview';
  const query = useQuery({ queryKey: ['partner-workspace'], queryFn: getPartnerWorkspace });
  const data = query.data;
  const content = useMemo(() => {
    if (!data?.ok) return null;
    if (section === 'overview') return <Overview data={data} />;
    if (section === 'codes') return <Codes data={data} />;
    if (section === 'generator') return <LinkGenerator data={data} />;
    if (section === 'content') return <ContentLinks data={data} />;
    if (section === 'earnings') return <Earnings data={data} />;
    if (section === 'payouts') return <Payouts data={data} />;
    if (section === 'profile') return <Profile data={data} />;
    return <Settings data={data} />;
  }, [data, section]);
  useEffect(() => {
    if (requested !== section) setParams({ section }, { replace: true });
  }, [requested, section, setParams]);
  return (
    <DestinationSurface eyebrow="GELLATTI" title="Partner">
      <div className="grid gap-8 xl:grid-cols-[220px_minmax(0,1fr)]">
        <nav
          aria-label="Nawigacja Partnera"
          className="border-y border-ink/10 xl:border-y-0 xl:border-r xl:pr-5"
        >
          {sections.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setParams({ section: id })}
              aria-current={section === id ? 'page' : undefined}
              className={cn(
                'pro-focus-ring flex min-h-11 w-full items-center border-b border-ink/10 px-2 text-left text-xs font-semibold uppercase tracking-[0.08em]',
                section === id ? 'bg-ink px-3 text-white' : 'text-stone-600 hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </nav>
        <main className="min-w-0">
          {query.isPending ? (
            <p className="text-sm text-stone-500">Wczytuję tryb Partner…</p>
          ) : null}
          {query.isError ? (
            <p className="text-sm text-status-error">
              Nie udało się odczytać bezpiecznego panelu Partner.
            </p>
          ) : null}
          {data && !data.ok ? (
            <div className="border border-ink/10 p-6">
              <h2 className="text-xl font-semibold text-ink">Tryb Partner niedostępny</h2>
              <p className="mt-3 text-sm text-stone-600">
                {data.reason === 'partner_not_active'
                  ? 'Status Partnera nie jest aktywny. Historia finansowa pozostaje zachowana.'
                  : 'Konto nie ma zaproszonej i zatwierdzonej roli Partner.'}
              </p>
              <Link
                to="/home"
                className="mt-5 inline-block text-sm font-semibold text-ink underline"
              >
                Wróć do Home
              </Link>
            </div>
          ) : (
            content
          )}
        </main>
      </div>
    </DestinationSurface>
  );
}
