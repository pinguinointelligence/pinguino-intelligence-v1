import { cn } from '@/lib/cn';
import { AppNavDrawer } from '@/features/shell/AppNavDrawer';
import { customerShellCopy as copy } from '../customerShellCopy';
import { color, type } from './tokens';

/**
 * The customer top bar — a wordmark plus THE canonical navigation drawer (owner P0, 2026-07-22:
 * the menu must be identical on every primary route). The old parallel drawer with its OWN item
 * list (including a separate „Studio" entry) is gone: this component now only lays out the slim
 * in-flow bar and mounts `AppNavDrawer`, which renders the ONE `appNav` config — NAWIGACJA +
 * PINGÜINO PRO (capability-gated) + the KONTO footer — with the same behavior everywhere
 * (right-side drawer, focus trap, Escape, scroll lock, safe areas).
 */
interface CustomerMenuProps {
  /**
   * Render the small wordmark next to the trigger. Surfaces that already show
   * their own brand lockup (the public landing) pass false so the page does
   * not carry two wordmarks (owner hotfix §2).
   */
  showBrand?: boolean;
}

export function CustomerMenu({ showBrand = true }: CustomerMenuProps = {}) {
  return (
    <div
      className="flex items-center justify-between"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {showBrand ? (
        <span className={cn(type.label, color.textSecondary)}>{copy.menu.brand}</span>
      ) : (
        <span aria-hidden />
      )}
      <AppNavDrawer />
    </div>
  );
}
