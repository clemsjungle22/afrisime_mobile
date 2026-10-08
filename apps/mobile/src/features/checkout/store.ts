import type { Fulfillment, PaymentMethodId } from '@afrisime/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { storageKey } from '@/api/config';

/**
 * Choix du checkout. Mode, adresse, agence et moyen de paiement sont mémorisés pour la
 * prochaine commande ; le créneau ne l'est pas (il change d'un jour à l'autre).
 */
type CheckoutPrefs = {
  fulfillment: Fulfillment;
  addressId: string | null;
  agencyId: string | null;
  paymentMethod: PaymentMethodId | null;
  slotId: string | null;
  setFulfillment: (f: Fulfillment) => void;
  setAddress: (id: string) => void;
  setAgency: (id: string) => void;
  setPaymentMethod: (id: PaymentMethodId) => void;
  setSlot: (id: string | null) => void;
  reset: () => void;
};

const initial = {
  fulfillment: 'delivery' as Fulfillment,
  addressId: null,
  agencyId: null,
  paymentMethod: null,
  slotId: null,
};

export const useCheckout = create<CheckoutPrefs>()(
  persist(
    (set) => ({
      ...initial,
      // Changer de mode ou de lieu invalide le créneau choisi.
      setFulfillment: (fulfillment) => set({ fulfillment, slotId: null }),
      setAddress: (addressId) => set({ addressId, slotId: null }),
      setAgency: (agencyId) => set({ agencyId, slotId: null }),
      setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
      setSlot: (slotId) => set({ slotId }),
      reset: () => set(initial),
    }),
    {
      name: storageKey('afrisime-checkout'),
      version: 1,
      // v1 : T-Money est devenu Mixx by Yas (identifiant tmoney → mixx).
      migrate: (persisted) => {
        const p = persisted as { paymentMethod?: string | null } | undefined;
        if (p?.paymentMethod === 'tmoney') p.paymentMethod = 'mixx';
        return p as never;
      },
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ fulfillment, addressId, agencyId, paymentMethod }) => ({
        fulfillment,
        addressId,
        agencyId,
        paymentMethod,
      }),
    },
  ),
);
