import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/cn';
import { applicationPrimaryClasses } from '@/components/ui/applicationControlStyles';
import { shopCopy as c } from '@/copy/shop';
import { PLAN_REQUIRED, ShopPlanRequired } from '@/features/shop/ShopPlanRequired';
import { useAuthStore } from '@/stores/authStore';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import {
  DocumentOrderError,
  STARTER_LOCAL_DOCUMENT_KEY,
  findActiveDocumentOrder,
  getDocumentDownload,
  getDocumentMarkets,
  getMyDocumentOrders,
  openDocumentDownload,
  orderDocument,
  type DocumentMarketChoice,
} from '@/services/shopDigitalDocument';
import { peekInfopakIntent, rememberInfopakIntent, takeInfopakIntent } from './infopakIntent';
import { useShopCountryStore } from './shopCountryStore';
import { languageDisplayName } from './shopDisplayNames';

/**
 * The free PDF shopping guide — a document, not a parcel.
 *
 * ONE 0 € offer (owner correction 2026-09-17): the PDF is made for the country chosen in the
 * Shop's own country picker, in that country's language, and lists the seven Starter Pack items
 * with local equivalents. A country with several languages offers each version.
 *
 * It sits after "Kup osobno" and before the cart. The benefit leads ("co kupić i gdzie"), the
 * price is present but quiet. The order is confirmed only together with a working download;
 * a missing file or a refusal is said as such, never as "ready".
 *
 * Which markets and languages exist, and whether THIS account may order one, is answered by the
 * server per document (OFF / TEST_ACCOUNTS_ONLY / ON). Hiding the button authorises nothing.
 */

export const INFOPAK_IMAGE_SRC = '/shop/infopak-pl.png';

const label =
  'text-[10px] leading-[1.25] font-bold tracking-[0.1em] text-[var(--g-text-secondary)] uppercase';

export type InfopakNotice =
  'notAvailable' | 'planRequired' | 'fileMissing' | 'failed' | 'downloadFailed';

/** Where the customer stands for the country chosen above. */
export type InfopakMarketState = 'CHOOSE_COUNTRY' | 'NOT_READY' | 'READY';

export interface ShopInfopakOfferViewProps {
  /** False while no market offers the document: nothing is shown at all. */
  offered: boolean;
  marketState: InfopakMarketState;
  countryName: string | null;
  languages: readonly string[];
  language: string | null;
  onLanguage: (language: string) => void;
  signedIn: boolean;
  ordering: boolean;
  downloading: boolean;
  orderNumber: string | null;
  notice: InfopakNotice | null;
  onOrder: () => void;
  onDownload: () => void;
}

export function ShopInfopakOfferView({
  offered,
  marketState,
  countryName,
  languages,
  language,
  onLanguage,
  signedIn,
  ordering,
  downloading,
  orderNumber,
  notice,
  onOrder,
  onDownload,
}: ShopInfopakOfferViewProps) {
  if (!offered) return null;
  return (
    <section
      id="shop-infopak"
      aria-labelledby="shop-infopak-title"
      className="mt-16 md:mt-23"
      data-testid="shop-infopak-offer"
    >
      <p className={label}>{c.infopak.kicker}</p>
      <div className="mt-3 grid gap-6 md:grid-cols-[220px_minmax(0,1fr)] md:gap-10">
        <img
          src={INFOPAK_IMAGE_SRC}
          alt={c.infopak.imageAlt}
          width={1200}
          height={1500}
          loading="lazy"
          className="h-auto w-[160px] rounded-[12px] border border-[var(--g-line)] bg-white md:w-[220px]"
          data-testid="shop-infopak-image"
        />
        <div className="min-w-0">
          <h2
            id="shop-infopak-title"
            className="text-[25px] leading-[1.2] font-extrabold tracking-[-0.032em]"
          >
            {c.infopak.name}
          </h2>
          <p
            className="mt-1.5 text-[15px] leading-[1.45] text-[var(--g-ink)]"
            data-testid="shop-infopak-subtitle"
          >
            {c.infopak.subtitle}
          </p>
          <p
            className="mt-2 font-mono text-[12px] tracking-[0.02em] text-[var(--g-text-secondary)]"
            data-testid="shop-infopak-price"
          >
            {c.infopak.formatPrice}
          </p>

          <div className="mt-4 grid max-w-[68ch] gap-3 text-[14px] leading-[1.55] text-[var(--g-text-secondary)]">
            {c.infopak.description.map((paragraph) => (
              <p key={paragraph.slice(0, 32)}>{paragraph}</p>
            ))}
          </div>

          <h3 className={cn(label, 'mt-5')}>{c.infopak.detailsTitle}</h3>
          <ul
            className="mt-2 grid gap-1 text-[13px] leading-[1.5] text-[var(--g-ink)]"
            data-testid="shop-infopak-details"
          >
            {c.infopak.details.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>

          <div className="mt-5">
            {marketState === 'CHOOSE_COUNTRY' ? (
              <p
                className="text-[13px] text-[var(--g-ink)]"
                data-testid="shop-infopak-country-state"
              >
                {c.infopak.chooseCountry}{' '}
                <a
                  href="#shop-country"
                  className="pro-focus-ring text-ink underline underline-offset-[3px]"
                  data-testid="shop-infopak-choose-country"
                >
                  {c.infopak.chooseCountryLink}
                </a>
              </p>
            ) : marketState === 'NOT_READY' ? (
              <p
                className="text-[13px] text-[var(--g-ink)]"
                data-testid="shop-infopak-country-state"
              >
                {c.infopak.notReady.replace('{country}', countryName ?? '')}{' '}
                <a
                  href="#shop-country"
                  className="pro-focus-ring text-ink underline underline-offset-[3px]"
                  data-testid="shop-infopak-choose-country"
                >
                  {c.infopak.changeCountry}
                </a>
              </p>
            ) : (
              <>
                <p className="text-[13px] text-[var(--g-ink)]" data-testid="shop-infopak-country">
                  <span className="text-[var(--g-text-secondary)]">{c.infopak.countryLabel}: </span>
                  {countryName}
                  {languages.length === 1 && language ? (
                    <span className="text-[var(--g-text-secondary)]">
                      {' · '}
                      {languageDisplayName(language)}
                    </span>
                  ) : null}
                </p>
                {languages.length > 1 ? (
                  <label className="mt-3 block text-[13px] text-[var(--g-ink)]">
                    <span className={cn(label, 'block')}>{c.infopak.languageLabel}</span>
                    <select
                      value={language ?? ''}
                      onChange={(event) => onLanguage(event.target.value)}
                      disabled={ordering}
                      className="mt-1.5 min-h-10 rounded-[8px] border border-[var(--g-line)] bg-white px-3 text-[14px]"
                      data-testid="shop-infopak-language"
                    >
                      {languages.map((code) => (
                        <option key={code} value={code}>
                          {languageDisplayName(code)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <div className="mt-4">
                  {orderNumber ? (
                    <div role="status" data-testid="shop-infopak-ready">
                      <p className="text-[14px] font-semibold text-[var(--g-ink)]">
                        {c.infopak.ready}
                      </p>
                      <p className="mt-1 font-mono text-[12px] text-[var(--g-text-secondary)]">
                        {orderNumber}
                      </p>
                      <button
                        type="button"
                        onClick={onDownload}
                        disabled={downloading}
                        className={applicationPrimaryClasses('mt-3')}
                        data-testid="shop-infopak-download"
                      >
                        {downloading ? c.infopak.downloadBusy : c.infopak.download}
                      </button>
                      <p className="mt-2 text-[12px] text-[var(--g-text-secondary)]">
                        {c.infopak.accountHint}
                      </p>
                    </div>
                  ) : (
                    <>
                      {signedIn ? null : (
                        <p className="text-[12px] text-[var(--g-text-secondary)]">
                          {c.infopak.signInFirst}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={onOrder}
                        disabled={ordering}
                        className={applicationPrimaryClasses('mt-2')}
                        data-testid="shop-infopak-order"
                      >
                        {ordering ? c.infopak.ctaBusy : c.infopak.cta}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
            {notice === 'planRequired' ? (
              <ShopPlanRequired className="mt-3" testId="shop-infopak-plan-required" />
            ) : notice ? (
              <p
                className="mt-3 text-[12px] text-[var(--g-attention-ink)]"
                role="alert"
                data-testid="shop-infopak-notice"
              >
                {c.infopak[notice]}
              </p>
            ) : null}
          </div>

          <p className="mt-5 max-w-[68ch] text-[11px] leading-relaxed text-[var(--g-text-muted)]">
            {c.infopak.smallPrint}
          </p>
        </div>
      </div>
    </section>
  );
}

const noticeFor = (error: unknown): InfopakNotice => {
  const code = error instanceof DocumentOrderError ? error.code : '';
  if (code === 'document_not_available') return 'notAvailable';
  /* The server's answer, not the UI's guess: the database refuses an order without an active HOME or PRO plan. */
  if (code === PLAN_REQUIRED) return 'planRequired';
  if (code === 'document_file_missing') return 'fileMissing';
  return 'failed';
};

const sameMarket = (a: DocumentMarketChoice | null, b: DocumentMarketChoice | null) =>
  !!a && !!b && a.countryIso2 === b.countryIso2 && a.language === b.language;

export function ShopInfopakOffer() {
  const queryClient = useQueryClient();
  const authStatus = useAuthStore((state) => state.status);
  const openAuthModal = useAuthModalStore((state) => state.open);
  const signedIn = authStatus === 'authed';
  const selectedIso = useShopCountryStore((state) => state.selected);
  const countries = useShopCountryStore((state) => state.countries);

  const markets = useQuery({
    queryKey: ['shop-document-markets', STARTER_LOCAL_DOCUMENT_KEY, authStatus],
    queryFn: () => getDocumentMarkets(STARTER_LOCAL_DOCUMENT_KEY),
    enabled: authStatus !== 'loading',
    staleTime: 30_000,
  });
  const market = markets.data?.find((entry) => entry.countryIso2 === selectedIso) ?? null;
  const languages = market?.variants.map((variant) => variant.language) ?? [];

  /* A remembered sign-in intent names the language that was clicked; start there. */
  const [chosenLanguage, setChosenLanguage] = useState<string | null>(
    () => peekInfopakIntent()?.language ?? null,
  );
  const language =
    chosenLanguage && languages.includes(chosenLanguage) ? chosenLanguage : (languages[0] ?? null);
  const variant = market?.variants.find((entry) => entry.language === language) ?? null;
  const choice: DocumentMarketChoice | null =
    market && language ? { countryIso2: market.countryIso2, language } : null;

  /* After a refresh or on a later visit the account's own order for THIS market and language
     is shown with its download. Same cache as Konto → Zamówienia. */
  const myDocuments = useQuery({
    queryKey: ['shop-documents', 'mine'],
    queryFn: getMyDocumentOrders,
    enabled: signedIn,
  });
  const existing =
    signedIn && choice
      ? findActiveDocumentOrder(myDocuments.data, STARTER_LOCAL_DOCUMENT_KEY, choice)
      : null;

  const [placed, setPlaced] = useState<
    (DocumentMarketChoice & { orderId: string; orderNumber: string }) | null
  >(null);
  const placedHere = placed && sameMarket(placed, choice) ? placed : null;
  const readyOrderId = placedHere?.orderId ?? existing?.id ?? null;
  const readyOrderNumber = placedHere?.orderNumber ?? existing?.orderNumber ?? null;

  const [notice, setNotice] = useState<InfopakNotice | null>(null);
  const [downloading, setDownloading] = useState(false);
  /* Closes the double-click window before React re-renders; the server is idempotent too. */
  const placing = useRef(false);

  const place = useMutation({
    mutationFn: (target: DocumentMarketChoice) => orderDocument(STARTER_LOCAL_DOCUMENT_KEY, target),
    onSuccess: (result, target) => {
      setPlaced({ ...target, orderId: result.orderId, orderNumber: result.orderNumber });
      setNotice(null);
      void queryClient.invalidateQueries({ queryKey: ['shop-documents', 'mine'] });
    },
    onError: (error) => setNotice(noticeFor(error)),
    onSettled: () => {
      placing.current = false;
    },
  });
  const { mutate } = place;

  const startOrder = () => {
    if (placing.current || place.isPending || !choice) return;
    if (!signedIn) {
      rememberInfopakIntent(choice);
      openAuthModal();
      return;
    }
    if (variant && !variant.orderable) {
      setNotice('notAvailable');
      return;
    }
    placing.current = true;
    setNotice(null);
    mutate(choice);
  };

  /* Signed in after clicking "Zamów za 0 €": continue THAT market's order once. The server
     decides for this account; a refusal comes back through the mutation. An account that
     already has that document just sees it ready. */
  const knownMarkets = markets.data;
  const documentsKnown = myDocuments.isFetched;
  const knownDocuments = myDocuments.data;
  useEffect(() => {
    if (!signedIn || !knownMarkets || !documentsKnown || placing.current) return;
    const intent = takeInfopakIntent();
    if (!intent) return;
    const offeredHere = knownMarkets.some(
      (entry) =>
        entry.countryIso2 === intent.countryIso2 &&
        entry.variants.some((item) => item.language === intent.language),
    );
    if (!offeredHere) return;
    if (findActiveDocumentOrder(knownDocuments, STARTER_LOCAL_DOCUMENT_KEY, intent)) return;
    placing.current = true;
    mutate(intent);
  }, [signedIn, knownMarkets, documentsKnown, knownDocuments, mutate]);

  const download = async () => {
    if (!readyOrderId) return;
    setDownloading(true);
    setNotice(null);
    try {
      /* A fresh short-lived link every time; nothing keeps an expired one around. */
      openDocumentDownload(await getDocumentDownload(readyOrderId));
    } catch (error) {
      setNotice(
        error instanceof DocumentOrderError && error.code === 'document_file_missing'
          ? 'fileMissing'
          : 'downloadFailed',
      );
    } finally {
      setDownloading(false);
    }
  };

  if (!markets.data) return null;
  const countryName = selectedIso
    ? (countries.find((country) => country.iso2 === selectedIso)?.name ?? selectedIso)
    : null;
  const marketState: InfopakMarketState = !selectedIso
    ? 'CHOOSE_COUNTRY'
    : market
      ? 'READY'
      : 'NOT_READY';
  return (
    <ShopInfopakOfferView
      offered={markets.data.length > 0}
      marketState={marketState}
      countryName={countryName}
      languages={languages}
      language={language}
      onLanguage={(code) => {
        setChosenLanguage(code);
        setNotice(null);
      }}
      signedIn={signedIn}
      ordering={place.isPending}
      downloading={downloading}
      orderNumber={readyOrderNumber}
      notice={notice}
      onOrder={startOrder}
      onDownload={() => void download()}
    />
  );
}
