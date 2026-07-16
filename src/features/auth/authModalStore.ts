/**
 * Tiny global store for the auth modal (Phase 2A.2) so both the hamburger menu
 * and the Advanced Studio "Save" action open the same modal.
 *
 * `notice` carries a one-shot message into the modal — used after an OAuth
 * redirect comes back with error params (user cancelled at Google, or the
 * provider reported a failure). It is cleared on close and on any new attempt.
 */
import { create } from 'zustand';

export interface AuthModalNotice {
  /** `oauth-cancelled` renders as a calm note; `oauth-failed` as an error. */
  kind: 'oauth-cancelled' | 'oauth-failed';
  /** Optional provider-supplied description, shown only for failures. */
  detail: string | null;
}

interface AuthModalState {
  isOpen: boolean;
  notice: AuthModalNotice | null;
  open: () => void;
  /** Open the modal already showing a notice (post-OAuth-redirect surfacing). */
  openWithNotice: (notice: AuthModalNotice) => void;
  clearNotice: () => void;
  close: () => void;
}

export const useAuthModalStore = create<AuthModalState>((set) => ({
  isOpen: false,
  notice: null,
  open: () => set({ isOpen: true, notice: null }),
  openWithNotice: (notice) => set({ isOpen: true, notice }),
  clearNotice: () => set({ notice: null }),
  close: () => set({ isOpen: false, notice: null }),
}));
