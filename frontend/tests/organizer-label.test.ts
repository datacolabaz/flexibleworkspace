import { describe, expect, it } from 'vitest';
import { organizerDisplayLabel } from '@/lib/events/organizer-label';

describe('organizerDisplayLabel', () => {
  it('uses organizerName from the API', () => {
    expect(organizerDisplayLabel({ organizerName: 'Aysel', organizerId: 'uuid' }, 'Organizer')).toBe(
      'Aysel',
    );
  });

  it('falls back when organizerName is missing', () => {
    expect(
      organizerDisplayLabel(
        { organizerId: 'a700ad7f-0eaf-44b9-b618-d8d12d201cb5' },
        'Təşkilatçı',
      ),
    ).toBe('Təşkilatçı');
  });

  it('never renders a UUID even if it was sent as organizerName', () => {
    expect(
      organizerDisplayLabel(
        { organizerName: 'a700ad7f-0eaf-44b9-b618-d8d12d201cb5' },
        'Organizer',
      ),
    ).toBe('Organizer');
  });
});
