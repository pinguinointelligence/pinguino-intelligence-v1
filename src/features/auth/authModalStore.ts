/**
 * Tiny global store for the auth modal (Phase 2A.2) so both the hamburger menu
 * and the Advanced Studio "Save" action open the same modal.
 */
import { create } from 'zustand';

interface AuthModalState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useAuthModalStore = create<AuthModalState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
