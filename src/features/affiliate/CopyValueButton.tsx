/**
 * H-DASH-06 — copy a partner's code or link in one click.
 *
 * Behaves like the referral panel's copy buttons: the label reads „Skopiowano"
 * for a moment after a copy. The clipboard is permission-gated and simply
 * unavailable in some contexts; the value is on screen and selectable, so a
 * refused copy leaves the label as it was and nothing else happens.
 *
 * `value` may be a function so an absolute URL is built from
 * `window.location.origin` at click time, never while rendering.
 */
import { useEffect, useState } from 'react';

export function CopyValueButton({
  value,
  label,
}: {
  value: string | (() => string);
  label: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(typeof value === 'function' ? value() : value);
      setCopied(true);
    } catch {
      // Nothing to recover: the value stays on screen and selectable.
    }
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-live="polite"
      className="pro-focus-ring min-h-10 text-xs font-semibold text-ink underline underline-offset-4"
    >
      {copied ? 'Skopiowano' : label}
    </button>
  );
}
