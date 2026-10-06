import type { Address, CartLine, UserProfile } from '@afrisime/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * « Base de données » du FAUX serveur (mode mock uniquement) : comptes et paniers serveur.
 * Persistée pour qu'une session survive au redémarrage de l'app, comme avec un vrai backend.
 */
export type MockDb = {
  users: Record<string, UserProfile>;
  /** Nonce du refresh token valide par utilisateur (rotation : l'ancien est invalidé). */
  refreshNonces: Record<string, string>;
  carts: Record<string, { lines: CartLine[]; updatedAt: string }>;
  addresses: Record<string, Address[]>;
};

const KEY = 'afrisime-mock-db';

export const SEED_USER: UserProfile = {
  id: 'usr_kossi',
  phone: '+22890000001',
  firstName: 'Kossi',
  lastName: 'Mensah',
  email: null,
  customerTypeId: 'particulier',
  segmentLabel: 'Particulier',
  customerTypePending: false,
  agencyId: 'agc_lome_centre',
  consents: { marketing: false, termsVersion: '2026-10' },
  profileComplete: true,
  createdAt: '2026-01-15T09:00:00.000Z',
};

export const SEED_ADDRESS: Address = {
  id: 'adr_kossi_maison',
  label: 'Maison',
  recipientName: 'Kossi Mensah',
  phone: '+22890000001',
  district: 'Tokoin',
  city: 'Lomé',
  landmark: 'Derrière la pharmacie du Rond-point, portail bleu',
  instructions: null,
  location: null,
  isDefault: true,
  zoneId: 'zone_1',
  zoneName: 'Zone 1 · Centre',
};

function emptyDb(): MockDb {
  return {
    users: { [SEED_USER.id]: SEED_USER },
    refreshNonces: {},
    carts: {},
    addresses: { [SEED_USER.id]: [SEED_ADDRESS] },
  };
}

let cache: MockDb | null = null;

export async function loadDb(): Promise<MockDb> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? { ...emptyDb(), ...(JSON.parse(raw) as MockDb) } : emptyDb();
  } catch {
    cache = emptyDb();
  }
  return cache;
}

export async function saveDb(db: MockDb): Promise<void> {
  cache = db;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    // Mock : une écriture ratée n'est pas bloquante.
  }
}

/** Tests : repart d'une base vierge. */
export function resetMockDb(): void {
  cache = emptyDb();
}
