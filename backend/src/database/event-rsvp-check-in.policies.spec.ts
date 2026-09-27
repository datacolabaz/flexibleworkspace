import { readFileSync } from 'fs';
import { join } from 'path';

describe('RLS RSVP check-in migration 035', () => {
  const source = readFileSync(
    join(__dirname, 'migrations/1700000000035-EventRsvpCheckIn.ts'),
    'utf8',
  );

  it('adds check-in columns and an organizer UPDATE policy', () => {
    expect(source).toContain('checked_in_at');
    expect(source).toContain('checked_in_by');
    expect(source).toContain('event_rsvps_update');
    expect(source).toContain("current_setting('app.current_user_id'");
  });
});
