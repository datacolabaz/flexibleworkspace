import { organizerPublicName } from './organizer-public-name';

describe('organizerPublicName', () => {
  it('prefers a display name over email', () => {
    expect(organizerPublicName('Aysel Mammadova', 'aysel@example.com')).toBe('Aysel Mammadova');
  });

  it('uses the email local-part when display name is missing', () => {
    expect(organizerPublicName(null, 'host@spotva.az')).toBe('host');
  });

  it('never returns a raw user UUID', () => {
    expect(organizerPublicName('a700ad7f-0eaf-44b9-b618-d8d12d201cb5', null)).toBeNull();
    expect(
      organizerPublicName(null, 'a700ad7f-0eaf-44b9-b618-d8d12d201cb5@example.com'),
    ).toBeNull();
  });
});
