import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { copy } from '@/copy/en';
import type { CatalogProductSearchHit } from '@/features/global-catalog/contracts';
import {
  getProductCapabilityReviewEligibility,
  requestProductCapabilityReview,
} from '@/services/productCapabilityReanalysis';
import { cn } from '@/lib/cn';
import type { ProductPickerCompatibility } from './productPickerCompatibility';

type ContextMismatch = Extract<ProductPickerCompatibility, { state: 'AVAILABLE_IN_OTHER_CONTEXT' }>;

export function ProductPickerContextualRow({
  product,
  compatibility,
  optionId,
  optionIndex,
  active,
  onActivate,
  onRoute,
}: {
  product: CatalogProductSearchHit;
  compatibility: ContextMismatch;
  optionId: string;
  optionIndex: number;
  active: boolean;
  onActivate: () => void;
  onRoute: () => void;
}) {
  const [submitted, setSubmitted] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [submissionFailed, setSubmissionFailed] = useState(false);
  const wording = copy.productPicker.contextual[compatibility.availableAs];
  const eligibility = useQuery({
    queryKey: [
      'product-capability-review-eligibility',
      product.id,
      compatibility.requestedCapability,
    ],
    queryFn: () =>
      getProductCapabilityReviewEligibility(product.id, compatibility.requestedCapability),
    enabled: product.entityKind === 'commercial_product',
    staleTime: 15_000,
    retry: false,
  });
  const request = useMutation({
    mutationFn: () =>
      requestProductCapabilityReview({
        productId: product.id,
        requestedCapability: compatibility.requestedCapability,
        attemptedContext: compatibility.attemptedContext,
      }),
    onSuccess: (result) => {
      setSubmissionFailed(false);
      if (result.alreadyExists) setAlreadySubmitted(true);
      else setSubmitted(true);
    },
    onError: () => setSubmissionFailed(true),
  });
  const existingRequest = alreadySubmitted || eligibility.data?.existingRequestStatus != null;
  const mayRequest = eligibility.data?.eligible === true && !existingRequest && !submitted;

  return (
    <article
      role="presentation"
      data-testid="product-picker-contextual-product"
      className={cn(
        'relative my-1 rounded-xl border bg-white transition-colors',
        active ? 'border-ink/18 bg-[var(--g-ivory)]' : 'border-ink/10 hover:border-ink/16',
      )}
      onMouseEnter={onActivate}
    >
      <div className="flex min-h-16 items-center">
        <button
          id={optionId}
          type="button"
          role="option"
          aria-selected={active}
          aria-label={`${product.displayName}. ${wording.badge}. ${wording.available} ${wording.route}`}
          data-option-index={optionIndex}
          data-entity-kind={product.entityKind}
          data-product-id={product.id}
          data-product-version-id={product.currentVersionId ?? undefined}
          className="pro-focus-ring flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-left"
          onClick={onRoute}
        >
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-[#EFE8DC] text-xs font-semibold text-ink"
          >
            ↗
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <strong className="truncate text-sm text-ink">{product.displayName}</strong>
              <span className="rounded-md border border-ink/10 bg-[var(--g-ivory)] px-1.5 py-0.5 text-[10px] font-semibold text-stone-600">
                {wording.badge}
              </span>
            </span>
            <span className="mt-0.5 block text-[11px] leading-relaxed text-stone-600">
              {wording.available}
            </span>
          </span>
        </button>
        <button
          type="button"
          aria-label={`${wording.route.replace(' →', '')} — ${product.displayName}`}
          className="pro-focus-ring mr-3 shrink-0 rounded-lg px-2 py-2 text-[11px] font-semibold text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-ink"
          onClick={onRoute}
        >
          {wording.route}
        </button>
      </div>

      {mayRequest || existingRequest || submitted || submissionFailed ? (
        <div className="border-t border-ink/8 px-3 py-2.5 text-[11px] leading-relaxed">
          {submitted ? (
            <div role="status" aria-live="polite">
              <p className="font-semibold text-ink">{wording.submitted}</p>
              <p className="mt-0.5 text-stone-600">{wording.unchanged}</p>
            </div>
          ) : existingRequest ? (
            <p className="text-stone-600" role="status">
              {copy.productPicker.contextual.existing}
            </p>
          ) : mayRequest ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-stone-600">{wording.question}</span>
              <button
                type="button"
                disabled={request.isPending}
                className="pro-focus-ring rounded-md px-1 py-1 font-semibold text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-ink disabled:opacity-50"
                onClick={() => request.mutate()}
              >
                {copy.productPicker.contextual.request}
              </button>
            </div>
          ) : null}
          {submissionFailed ? (
            <p className="mt-1 text-stone-600" role="alert">
              {copy.productPicker.contextual.failed}
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
