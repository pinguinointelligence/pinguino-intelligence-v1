/**
 * React side of the unsaved-forms register (package PRODUKCJA V3, Etap 1 §1.5).
 *
 * A form hands over its CURRENT dirty flag and its EXISTING save / discard. The hook keeps one
 * registration for the form's lifetime (the callbacks are read through a ref, so a re-render
 * never re-registers) and mirrors the dirty flag into the register, which drives the section
 * dot and arms `beforeunload` only while something is unsaved.
 */
import { useEffect, useRef } from 'react';
import { registerUnsaved, setUnsavedDirty, type UnsavedSaveResult } from './unsavedGuard';

export interface UnsavedFormRegistration {
  id: string;
  label?: string;
  /** False disables the registration entirely (e.g. no saved machine, nothing to save). */
  enabled?: boolean;
  dirty: boolean;
  save: () => Promise<UnsavedSaveResult>;
  discard: () => void;
}

export function useRegisterUnsaved(registration: UnsavedFormRegistration): void {
  const latest = useRef(registration);
  useEffect(() => {
    latest.current = registration;
  });
  const { id, label, enabled = true, dirty } = registration;

  useEffect(() => {
    if (!enabled) return;
    return registerUnsaved({
      id,
      ...(label ? { label } : {}),
      isDirty: () => latest.current.enabled !== false && latest.current.dirty,
      save: () => latest.current.save(),
      discard: () => latest.current.discard(),
    });
  }, [enabled, id, label]);

  useEffect(() => {
    if (!enabled) return;
    setUnsavedDirty(id, dirty);
  }, [dirty, enabled, id]);
}
