/** Chaque test recharge la config avec un environnement et une adresse Metro différents. */
function loadConfig(env: { url?: string; mock?: string }, hostUri: string | undefined) {
  process.env.EXPO_PUBLIC_API_URL = env.url ?? '';
  process.env.EXPO_PUBLIC_API_MOCK = env.mock ?? 'false';
  let mod: typeof import('../config') | undefined;
  jest.isolateModules(() => {
    jest.doMock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { hostUri } } }));
    mod = require('../config');
  });
  return mod!;
}

const saved = { url: process.env.EXPO_PUBLIC_API_URL, mock: process.env.EXPO_PUBLIC_API_MOCK };
afterEach(() => {
  process.env.EXPO_PUBLIC_API_URL = saved.url;
  process.env.EXPO_PUBLIC_API_MOCK = saved.mock;
  jest.dontMock('expo-constants');
});

describe('adresse du serveur', () => {
  it("en développement : l'adresse du PC (celle de Metro) sur le port 4000", () => {
    expect(loadConfig({}, '10.119.16.206:8081').apiConfig.baseUrl).toBe('http://10.119.16.206:4000');
  });

  it('EXPO_PUBLIC_API_URL prime (barre finale retirée)', () => {
    expect(loadConfig({ url: 'https://api.afrisime.tg/' }, '10.0.0.2:8081').apiConfig.baseUrl).toBe('https://api.afrisime.tg');
  });

  it("mode tunnel (…exp.direct) : aucune adresse inventée, explication affichable", () => {
    const config = loadConfig({}, 'yx0x3mw-cayigah-8081.exp.direct');
    expect(config.apiConfig.baseUrl).toBe('');
    expect(config.missingServerReason()).toMatch(/mode tunnel/);
  });

  it('adresse trouvée ou mode démo : rien à signaler', () => {
    expect(loadConfig({}, '192.168.1.69:8081').missingServerReason()).toBeNull();
    expect(loadConfig({ mock: 'true' }, 'x.exp.direct').missingServerReason()).toBeNull();
  });

  it('sans adresse Metro ni variable : vide', () => {
    expect(loadConfig({}, undefined).apiConfig.baseUrl).toBe('');
  });
});

describe('noms d’enregistrement', () => {
  it('séparés entre le mode démo et le mode serveur', () => {
    expect(loadConfig({ mock: 'true' }, undefined).storageKey('afrisime.session')).toBe('afrisime.session');
    expect(loadConfig({ mock: 'false' }, undefined).storageKey('afrisime.session')).toBe('afrisime.session.api');
  });
});
