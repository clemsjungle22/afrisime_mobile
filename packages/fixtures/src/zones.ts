/**
 * Zones de livraison d'EXEMPLE (Lomé). [À confirmer par AfriSime] : découpage réel,
 * frais, seuils et conditions du paiement à la livraison. Côté serveur, tout est paramétrable (RB-010).
 */
export type MockZone = {
  id: string;
  name: string;
  fee: number;
  /** Paiement à la livraison autorisé dans cette zone. */
  cashOnDelivery: boolean;
  districts: string[];
};

export const mockZones: MockZone[] = [
  {
    id: 'zone_1',
    name: 'Zone 1 · Centre',
    fee: 500,
    cashOnDelivery: true,
    districts: ['Grand Marché', 'Kodjoviakopé', 'Nyékonakpoè', 'Tokoin', 'Bè', 'Hanoukopé', 'Amoutivé', 'Doumassessé'],
  },
  {
    id: 'zone_2',
    name: 'Zone 2',
    fee: 1000,
    cashOnDelivery: true,
    districts: ['Agoè', 'Adidogomé', 'Avédji', 'Djidjolé', 'Hédzranawoé', 'Bè-Kpota', 'Kégué', 'Akodésséwa'],
  },
  {
    id: 'zone_3',
    name: 'Zone 3 · Périphérie',
    fee: 1500,
    cashOnDelivery: false,
    districts: ['Baguida', 'Légbassito', 'Sanguéra', 'Togblékopé', 'Avépozo', 'Agoè-Nyivé'],
  },
];

export const DELIVERY_RULES = {
  /** Livraison offerte à partir de ce sous-total (FCFA). */
  freeAbove: 50_000,
  /** Sous-total minimum pour être livré (FCFA). */
  minOrderAmount: 2_000,
  /** Plafond du paiement à la livraison (FCFA). */
  cashOnDeliveryMax: 100_000,
  /** Délai minimal de préparation avant un créneau. */
  leadTimeMs: 60 * 60_000,
  /** Durée de validité d'un devis. */
  quoteTtlMs: 15 * 60_000,
  /** Bonus déduit des frais de livraison pour un paiement Mobile Money (FCFA). */
  mobileMoneyBonus: 500,
  /** Achats sur 30 jours au-delà desquels l'identité doit être vérifiée (FCFA). */
  kycThreshold: 500_000,
} as const;

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Zone d'une adresse (null = non desservie : hors Lomé ou quartier inconnu). */
export function zoneFor(district: string, city: string): MockZone | null {
  if (normalize(city) !== 'lome') return null;
  const d = normalize(district);
  return mockZones.find((z) => z.districts.some((x) => normalize(x) === d)) ?? null;
}

/** Quartiers proposés à la saisie (suggestions). */
export const knownDistricts = mockZones.flatMap((z) => z.districts).sort((a, b) => a.localeCompare(b, 'fr'));
