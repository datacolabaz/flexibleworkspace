import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Guards the P1 contract: ownership policies must not reintroduce
 * blanket USING(true) on private/financial tables.
 */
describe('RLS ownership migration 033', () => {
  const source = readFileSync(
    join(
      __dirname,
      'migrations/1700000000033-RlsOwnershipEnforcement.ts',
    ),
    'utf8',
  );

  const up = source.slice(
    source.indexOf('public async up'),
    source.indexOf('public async down'),
  );

  it('does not recreate app_user_all_* USING(true) policies in up()', () => {
    expect(up).not.toMatch(/CREATE POLICY[\s\S]{0,80}app_user_all_/);
    expect(up).not.toMatch(/USING\s*\(\s*true\s*\)/i);
  });

  it('sets session-variable predicates on booking, ledger, and payout', () => {
    expect(up).toContain("current_setting('app.current_user_id'");
    expect(up).toContain("current_setting('app.current_provider_id'");
    expect(up).toContain("current_setting('app.current_role'");
    expect(up).toContain('CREATE POLICY booking_select');
    expect(up).toContain('CREATE POLICY ledger_entry_select');
    expect(up).toContain('CREATE POLICY ledger_entry_insert');
    expect(up).not.toMatch(/CREATE POLICY ledger_entry_update/);
    expect(up).not.toMatch(/CREATE POLICY ledger_entry_delete/);
  });

  it('uses customer_user_id on booking policies', () => {
    expect(up).toContain('customer_user_id::text');
    expect(up).toContain('CREATE POLICY booking_select');
  });
});
