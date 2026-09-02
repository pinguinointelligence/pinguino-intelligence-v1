import { useQuery } from '@tanstack/react-query';
import { ApplicationState } from '@/components/shared/ApplicationState';
import { supabase } from '@/lib/supabase/client';
import { shopMoney } from '@/copy/shop';

/**
 * SHOP, READ ON ITS OWN.
 *
 * Application revenue and Shop revenue used to be mixed, so neither could be
 * judged. This panel reports the Shop side only; subscriptions keep their own
 * section, and a combined total can add the two without either becoming a
 * component of the other.
 *
 * Three things it deliberately does NOT do:
 *  - it does not fold shipping into product revenue (collecting postage is not
 *    selling anything);
 *  - it does not count 0 EUR Local packs as revenue — they get their own line,
 *    because an order that earned nothing must never inflate a number;
 *  - it does not say "profit" or "margin" unless a carrier cost is actually
 *    recorded. Revenue labelled profit against unknown costs is a lie the
 *    dashboard would repeat every day.
 */

interface ShopSummary {
  orders: number;
  paid: number;
  awaitingFulfilment: number;
  shipped: number;
  refunded: number;
  productRevenueCents: number;
  shippingCollectedCents: number;
  localPackOrders: number;
  carrierCostKnownCents: number;
  carrierCostKnown: boolean;
  error?: string;
}

const readSummary = async (): Promise<ShopSummary> => {
  if (!supabase) throw new Error('backend unavailable');
  const { data, error } = await supabase.rpc('gellatti_shop_revenue_summary_v1');
  if (error) throw new Error(error.message);
  return data as unknown as ShopSummary;
};

const Metric = ({
  label,
  value,
  hint,
  testId,
}: {
  label: string;
  value: string;
  hint?: string;
  testId: string;
}) => (
  <div className="rounded-[10px] border border-[var(--g-line)] bg-white px-4 py-3">
    <p className="text-[10px] font-bold tracking-[0.1em] text-[var(--g-text-secondary)] uppercase">
      {label}
    </p>
    <p className="mt-1 font-mono text-[18px] font-semibold tabular-nums" data-testid={testId}>
      {value}
    </p>
    {hint ? <p className="mt-0.5 text-[11px] text-[var(--g-text-secondary)]">{hint}</p> : null}
  </div>
);

export function AdminShopRevenuePanel() {
  const summary = useQuery({ queryKey: ['admin', 'shop-revenue'], queryFn: readSummary });

  if (summary.isLoading) return <ApplicationState kind="loading" title="Wczytuję dane sklepu…" />;
  if (summary.isError || summary.data?.error) {
    return <ApplicationState kind="error" title="Nie udało się wczytać danych sklepu." />;
  }
  const data = summary.data!;

  return (
    <section className="mt-6" data-testid="admin-shop-revenue">
      <h3 className="text-[14px] font-bold tracking-[-0.01em] text-[var(--g-ink)]">
        Sklep — sprzedaż
      </h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Przychód z produktów"
          value={shopMoney(data.productRevenueCents, 'eur')}
          hint="Bez wysyłki"
          testId="shop-product-revenue"
        />
        <Metric
          label="Pobrana wysyłka"
          value={shopMoney(data.shippingCollectedCents, 'eur')}
          hint="Osobno, nie przychód z produktu"
          testId="shop-shipping-collected"
        />
        <Metric
          label="Zamówienia opłacone"
          value={String(data.paid)}
          hint={`Do wysyłki: ${data.awaitingFulfilment} · Wysłane: ${data.shipped}`}
          testId="shop-paid-orders"
        />
        <Metric
          label="Lokalny Zestaw · 0 €"
          value={String(data.localPackOrders)}
          hint="Zamówienia bez przychodu"
          testId="shop-local-orders"
        />
      </div>
      <p className="mt-2 text-[11.5px] text-[var(--g-text-secondary)]">
        {data.carrierCostKnown
          ? `Znany koszt kuriera: ${shopMoney(data.carrierCostKnownCents, 'eur')}. Marża liczona wyłącznie dla zamówień z zapisanym kosztem.`
          : 'Koszt kuriera nie jest jeszcze zapisany w cenniku wysyłki, więc marża nie jest pokazywana — przychód to nie zysk.'}
      </p>
    </section>
  );
}
