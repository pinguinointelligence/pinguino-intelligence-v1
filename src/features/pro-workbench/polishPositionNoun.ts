export function polishPositionNoun(count: number): 'pozycja' | 'pozycje' | 'pozycji' {
  if (count === 1) return 'pozycja';
  const absolute = Math.abs(count);
  const mod10 = absolute % 10;
  const mod100 = absolute % 100;
  return mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)
    ? 'pozycje'
    : 'pozycji';
}
