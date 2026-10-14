/**
 * Should TanStack Query send a failed request again?
 *
 * This file imports nothing, on purpose. The app has no test runner, so the
 * rule is tested from `worker/tests/diagnostics.test.ts`, which imports this
 * file directly. Keep it free of app imports so that it stays testable there.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  /**
   * A 4xx is a refusal of this request: not signed in, not permitted, not
   * found, or a query that ERPNext will not run. The same request gets the same
   * refusal, so a retry only delays the message and doubles the load on the
   * studio's site. On 2026-10-04 each failed page sent its 417 twice.
   */
  if (typeof status === 'number' && status >= 400 && status < 500) return false;
  // A 5xx or a network failure can pass the second time. One more try.
  return failureCount < 1;
}
