import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/cn';
import { applicationPrimaryClasses } from '@/components/ui/applicationControlStyles';
import { shopCopy as c } from '@/copy/shop';
import { useAuthStore } from '@/stores/authStore';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import {
  DocumentOrderError,
  INFOPAK_DOCUMENT_KEY,
  findActiveDocumentOrder,
  getDocumentAvailability,
  getDocumentDownload,
  getMyDocumentOrders,
  openDocumentDownload,
  orderDocument,
  type DocumentAvailabilityState,
} from '@/services/shopDigitalDocument';
import { rememberInfopakIntent, takeInfopakIntent } from './infopakIntent';

/**
 * The free PDF shopping guide — a document, not a parcel.
 *
 * It sits after "Kup osobno" and before the cart, independent of the country picker and
 * of the Starter Pack mode: the guide covers all 75 markets in one file. The benefit leads
 * ("co kupić i gdzie"), the price is present but quiet, and the document language is
 * stated plainly. The order is confirmed only together with a working download; a missing
 * file or a refusal is said as such, never as "ready".
 *
 * Whether the offer is visible at all, and whether THIS account may order it, is answered
 * by the server (OFF / TEST_ACCOUNTS_ONLY / ON). Hiding the button authorises nothing.
 */

export const INFOPAK_IMAGE_SRC = '/shop/infopak-pl.png';

const label =
  'text-[10px] leading-[1.25] font-bold tracking-[0.1em] text-[var(--g-text-secondary)] uppercase';

export type InfopakNotice = 'notAvailable' | 'fileMissing' | 'failed' | 'downloadFailed';

export interface ShopInfopakOfferViewProps {
  state: DocumentAvailabilityState;
  signedIn: boolean;
  ordering: boolean;
  downloading: boolean;
  orderNumber: string | null;
  notice: InfopakNotice | null;
  onOrder: () => void;
  onDownload: () => void;
}

export function ShopInfopakOfferView({
  state,
  signedIn,
  ordering,
  downloading,
  orderNumber,
  notice,
  onOrder,
  onDownload,
}: ShopInfopakOfferViewProps) {
  if (state === 'OFF') return null;
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
            {orderNumber ? (
              <div role="status" data-testid="shop-infopak-ready">
                <p className="text-[14px] font-semibold text-[var(--g-ink)]">{c.infopak.ready}</p>
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
            {notice ? (
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
  if (code === 'document_file_missing') return 'fileMissing';
  return 'failed';
};

export function ShopInfopakOffer() {
  const queryClient = useQueryClient();
  const authStatus = useAuthStore((state) => state.status);
  const openAuthModal = useAuthModalStore((state) => state.open);
  const signedIn = authStatus === 'authed';

  const availability = useQuery({
    queryKey: ['shop-document-availability', INFOPAK_DOCUMENT_KEY, authStatus],
    queryFn: () => getDocumentAvailability(INFOPAK_DOCUMENT_KEY),
    enabled: authStatus !== 'loading',
    staleTime: 30_000,
  });

  /* After a refresh or on a later visit the account's own order is shown with its
     download, instead of offering the same guide again. Same cache as Konto → Zamówienia. */
  const myDocuments = useQuery({
    queryKey: ['shop-documents', 'mine'],
    queryFn: getMyDocumentOrders,
    enabled: signedIn,
  });
  const existing = signedIn
    ? findActiveDocumentOrder(myDocuments.data, INFOPAK_DOCUMENT_KEY)
    : null;

  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const readyOrderId = orderId ?? existing?.id ?? null;
  const readyOrderNumber = orderNumber ?? existing?.orderNumber ?? null;
  const [notice, setNotice] = useState<InfopakNotice | null>(null);
  const [downloading, setDownloading] = useState(false);
  /* Closes the double-click window before React re-renders; the server is idempotent too. */
  const placing = useRef(false);

  const place = useMutation({
    mutationFn: () => orderDocument(INFOPAK_DOCUMENT_KEY),
    onSuccess: (result) => {
      setOrderId(result.orderId);
      setOrderNumber(result.orderNumber);
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
    if (placing.current || place.isPending) return;
    if (!signedIn) {
      rememberInfopakIntent();
      openAuthModal();
      return;
    }
    if (availability.data && !availability.data.orderable) {
      setNotice('notAvailable');
      return;
    }
    placing.current = true;
    setNotice(null);
    mutate();
  };

  /* Signed in after clicking "Zamów za 0 €": continue that order once. The server
     decides for THIS account; a refusal comes back through the mutation. An account
     that already has the guide just sees it ready. */
  const availableForAccount = availability.data;
  const documentsKnown = myDocuments.isFetched;
  useEffect(() => {
    if (!signedIn || !availableForAccount || !documentsKnown || placing.current) return;
    if (!takeInfopakIntent() || readyOrderId) return;
    placing.current = true;
    mutate();
  }, [signedIn, availableForAccount, documentsKnown, readyOrderId, mutate]);

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

  if (!availability.data) return null;
  return (
    <ShopInfopakOfferView
      state={availability.data.state}
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
