/** The picker owns a higher stacking layer than the PI panel. This helper keeps
 * ordinary backdrop clicks close-only, but forwards the one exact click that
 * lands over the underlying PI control after the picker has closed. */
export function closeProductPickerForPointer(
  point: { clientX: number; clientY: number },
  close: () => void,
  schedule: (callback: () => void) => void = (callback) => {
    window.requestAnimationFrame(callback);
  },
): boolean {
  const piControl = document.elementsFromPoint?.(point.clientX, point.clientY)
    .find((element) => element.getAttribute('data-testid') === 'pro-workbar-recalc');
  close();
  if (!(piControl instanceof HTMLButtonElement) || piControl.disabled) return false;
  schedule(() => piControl.click());
  return true;
}
