import type { OnboardingOptions } from '@afrisime/shared';

/**
 * Listes d'inscription d'EXEMPLE. [À confirmer par AfriSime] : types de client,
 * agences réelles (adresses, horaires) et URL des CGU / politique de confidentialité.
 */
export const mockOnboardingOptions: OnboardingOptions = {
  customerTypes: [
    {
      id: 'particulier',
      label: 'Particulier / Famille',
      description: 'Courses du quotidien pour la maison.',
      requiresReview: false,
    },
    {
      id: 'revendeur',
      label: 'Revendeur / Commerçant',
      description: 'Achats en gros pour revendre. Tarifs dédiés après validation.',
      requiresReview: true,
    },
    {
      id: 'restaurant',
      label: 'Restaurant / Hôtel',
      description: 'Volumes réguliers, factures, créneaux de livraison.',
      requiresReview: true,
    },
    {
      id: 'pme',
      label: 'Entreprise / PME',
      description: 'Achats pour votre structure, facturation entreprise.',
      requiresReview: true,
    },
  ],
  agencies: [
    {
      id: 'agc_lome_centre',
      name: 'Lomé Centre',
      city: 'Lomé',
      address: 'Quartier Grand Marché',
      phone: null,
      openingHours: 'Lun–Sam 7h30–19h',
      isDefault: true,
    },
    {
      id: 'agc_lome_agoe',
      name: 'Lomé Agoè',
      city: 'Lomé',
      address: 'Agoè-Nyivé',
      phone: null,
      openingHours: 'Lun–Sam 7h30–19h',
      isDefault: false,
    },
    {
      id: 'agc_lome_be',
      name: 'Lomé Bè',
      city: 'Lomé',
      address: 'Bè-Kpota',
      phone: null,
      openingHours: 'Lun–Sam 8h–18h30',
      isDefault: false,
    },
  ],
  termsVersion: '2026-10',
  termsUrl: 'https://afrisime-site-kappa.vercel.app/cgu',
  privacyUrl: 'https://afrisime-site-kappa.vercel.app/confidentialite',
};
