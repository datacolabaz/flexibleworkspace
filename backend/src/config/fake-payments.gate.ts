/**
 * Staging-only FakePaymentAdapter gate.
 *
 * - `NODE_ENV=production` is NEVER fake, even if merchant keys are unset
 *   and even if `FAKE_PAYMENTS=true`.
 * - `NODE_ENV=staging` or `NODE_ENV=test` selects the fake adapter.
 * - Any other non-production env (e.g. `development`) requires the
 *   explicit flag `FAKE_PAYMENTS=true`.
 *
 * Deployed P0 E2E therefore needs the staging API to run with
 * `NODE_ENV=staging` (not `production`).
 */
export function isFakePaymentsEnabled(
  nodeEnv: string | undefined,
  fakePaymentsFlag?: string,
): boolean {
  const env = nodeEnv ?? '';
  if (env === 'production') return false;
  if (env === 'staging' || env === 'test') return true;
  return fakePaymentsFlag === 'true';
}
