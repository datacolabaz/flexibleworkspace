import { readFileSync } from 'fs';
import { join } from 'path';

describe('RLS guest RSVP migration 034', () => {
  const source = readFileSync(
    join(__dirname, 'migrations/1700000000034-EventRsvpPublicGuestPolicy.ts'),
    'utf8',
  );

  const up = source.slice(
    source.indexOf('public async up'),
    source.indexOf('public async down'),
  );

  it('allows guest INSERT when user_id is null on published/rsvp_open events', () => {
    expect(up).toContain('user_id IS NULL');
    expect(up).toContain("'published','rsvp_open'");
    expect(up).toContain("current_setting('app.current_user_id'");
  });

  it('keeps authenticated INSERT tied to the session user id', () => {
    expect(up).toContain(
      "CAST(user_id AS text) = current_setting('app.current_user_id', true)",
    );
  });
});
