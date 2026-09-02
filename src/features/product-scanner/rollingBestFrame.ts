export interface RankedFrame<T> {
  value: T;
  score: number;
  readable: boolean;
  capturedAt: number;
}

/**
 * Quality ranks evidence within a short window; it never becomes an endless gate.
 * Unreadable observations can guide the user, but only the best readable candidate wins.
 */
export class RollingBestFrameWindow<T> {
  private openedAt: number | null = null;
  private best: RankedFrame<T> | null = null;

  constructor(readonly windowMs = 700) {}

  offer(candidate: RankedFrame<T>): void {
    this.openedAt ??= candidate.capturedAt;
    if (!candidate.readable) return;
    if (!this.best || candidate.score > this.best.score) this.best = candidate;
  }

  takeReady(now: number): RankedFrame<T> | null {
    if (this.openedAt === null || now - this.openedAt < this.windowMs || !this.best) return null;
    const selected = this.best;
    this.reset();
    return selected;
  }

  reset(): void {
    this.openedAt = null;
    this.best = null;
  }
}
