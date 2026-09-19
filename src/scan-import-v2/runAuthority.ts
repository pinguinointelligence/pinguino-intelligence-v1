/**
 * One authority object for a single user scan invocation.
 *
 * The barcode identifies WHAT was scanned. The id identifies WHICH invocation is current. They
 * must never be used interchangeably when asynchronous work completes.
 */
export interface ScanRunAuthority {
  readonly id: string;
  readonly barcode: string;
  isCurrent(): boolean;
}

export class StaleScanRunError extends Error {
  readonly code = 'stale_scan_run';

  constructor() {
    super('stale_scan_run');
    this.name = 'StaleScanRunError';
  }
}

export function assertScanRunCurrent(ctx: { scanRun?: ScanRunAuthority }): void {
  if (ctx.scanRun && !ctx.scanRun.isCurrent()) throw new StaleScanRunError();
}

export function isStaleScanRunError(error: unknown): error is StaleScanRunError {
  return error instanceof StaleScanRunError;
}
