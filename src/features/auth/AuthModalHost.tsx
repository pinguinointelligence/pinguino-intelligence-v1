import { AuthModal } from './AuthModal';
import { useAuthModalStore } from './authModalStore';

/** Mounted once at the app root — renders the auth modal when any caller opens it. */
export function AuthModalHost() {
  const isOpen = useAuthModalStore((state) => state.isOpen);
  const close = useAuthModalStore((state) => state.close);
  if (!isOpen) return null;
  return <AuthModal onClose={close} />;
}
