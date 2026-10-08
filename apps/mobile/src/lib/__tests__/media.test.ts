import { mediaUri } from '../media';

// Remonté par Jest au-dessus des imports : le module lit cette configuration.
jest.mock('@/api/config', () => ({ apiConfig: { baseUrl: 'http://192.168.1.69:4000' } }));

describe('mediaUri', () => {
  it('complète une adresse relative avec celle du serveur', () => {
    expect(mediaUri('/media/products/prd_1-abc.webp')).toBe('http://192.168.1.69:4000/media/products/prd_1-abc.webp');
  });

  it('garde une adresse absolue ; null sans photo', () => {
    expect(mediaUri('https://cdn.afrisime.tg/riz.webp')).toBe('https://cdn.afrisime.tg/riz.webp');
    expect(mediaUri(null)).toBeNull();
    expect(mediaUri('')).toBeNull();
  });
});
