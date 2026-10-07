import type { Address, UserProfile } from '@afrisime/shared';

/** Compte de démonstration (connexion : 90 00 00 01, code de test en développement). */
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
