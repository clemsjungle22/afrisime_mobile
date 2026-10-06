import {
  MAX_LINE_QUANTITY,
  type Availability,
  type CartValidateRequest,
  type ProductSummary,
  type ValidatedCart,
  type ValidatedCartLine,
  type Variant,
} from '@afrisime/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Copie des infos produit au moment de l'ajout : permet d'afficher le panier hors ligne.
 * Le prix y est INDICATIF : seul le prix renvoyé par la revalidation serveur fait foi.
 */
export type LineSnapshot = {
  productSlug: string;
  name: string;
  brand: string;
  variantLabel: string;
  unitPrice: number | null;
  color: string;
  imageUrl: string | null;
  availability: Availability;
  leadTimeDays: number | null;
  minQuantity: number;
};

export type LocalCartLine = {
  variantId: string;
  quantity: number;
  addedAt: number;
  snapshot: LineSnapshot;
};

type CartState = {
  lines: LocalCartLine[];
  /** Ajoute (ou cumule) un format. Retourne la quantité finale de la ligne. */
  add: (product: Pick<ProductSummary, 'slug' | 'name' | 'brand' | 'color' | 'imageUrl'>, variant: Variant, quantity: number) => number;
  setQuantity: (variantId: string, quantity: number) => void;
  /** Retire une ligne et la renvoie (pour « Annuler »). */
  remove: (variantId: string) => { line: LocalCartLine; index: number } | null;
  /** Remet une ligne retirée à sa place. */
  restore: (line: LocalCartLine, index: number) => void;
  /** Aligne le panier local sur la revalidation serveur (« J'ai compris »). */
  applyValidation: (validated: ValidatedCart) => void;
  /** Ajoute des lignes revalidées par le serveur (« Commander à nouveau »). Retourne le nombre ajouté. */
  addValidated: (lines: ValidatedCartLine[]) => number;
  /** Remplace tout le panier (fusion avec le panier serveur à la connexion). */
  replaceLines: (lines: LocalCartLine[]) => void;
  clear: () => void;
};

export function clampQuantity(quantity: number, minQuantity: number): number {
  if (!Number.isFinite(quantity)) return minQuantity;
  return Math.min(MAX_LINE_QUANTITY, Math.max(minQuantity, Math.trunc(quantity)));
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],

      add: (product, variant, quantity) => {
        const existing = get().lines.find((l) => l.variantId === variant.id);
        const nextQuantity = clampQuantity((existing?.quantity ?? 0) + quantity, variant.minQuantity);
        const snapshot: LineSnapshot = {
          productSlug: product.slug,
          name: product.name,
          brand: product.brand,
          variantLabel: variant.label,
          unitPrice: variant.price,
          color: product.color,
          imageUrl: product.imageUrl,
          availability: variant.availability,
          leadTimeDays: variant.leadTimeDays,
          minQuantity: variant.minQuantity,
        };
        set((s) => ({
          lines: existing
            ? s.lines.map((l) => (l.variantId === variant.id ? { ...l, quantity: nextQuantity, snapshot } : l))
            : [...s.lines, { variantId: variant.id, quantity: nextQuantity, addedAt: Date.now(), snapshot }],
        }));
        return nextQuantity;
      },

      setQuantity: (variantId, quantity) =>
        set((s) => ({
          lines: s.lines.map((l) =>
            l.variantId === variantId ? { ...l, quantity: clampQuantity(quantity, l.snapshot.minQuantity) } : l,
          ),
        })),

      remove: (variantId) => {
        const index = get().lines.findIndex((l) => l.variantId === variantId);
        const line = get().lines[index];
        if (!line) return null;
        set((s) => ({ lines: s.lines.filter((l) => l.variantId !== variantId) }));
        return { line, index };
      },

      restore: (line, index) =>
        set((s) => {
          if (s.lines.some((l) => l.variantId === line.variantId)) return s;
          const lines = [...s.lines];
          lines.splice(Math.min(index, lines.length), 0, line);
          return { lines };
        }),

      applyValidation: (validated) =>
        set((s) => {
          const byId = new Map(validated.lines.map((l) => [l.variantId, l]));
          const lines: LocalCartLine[] = [];
          for (const line of s.lines) {
            const server = byId.get(line.variantId);
            // Absent de la réponse = retiré du catalogue.
            if (!server) continue;
            lines.push({
              ...line,
              // Indisponible : on garde la quantité demandée, l'utilisateur décide de retirer.
              quantity: server.status === 'unavailable' ? line.quantity : Math.max(1, server.quantity),
              snapshot: {
                ...line.snapshot,
                unitPrice: server.unitPrice,
                availability: server.availability,
                leadTimeDays: server.leadTimeDays,
                minQuantity: server.minQuantity,
              },
            });
          }
          return { lines };
        }),

      addValidated: (validated) => {
        const usable = validated.filter((v) => v.status !== 'unavailable' && v.quantity > 0);
        set((s) => {
          const lines = [...s.lines];
          for (const v of usable) {
            const i = lines.findIndex((l) => l.variantId === v.variantId);
            const snapshot = snapshotFromServer(v);
            if (i >= 0) {
              const current = lines[i]!;
              lines[i] = { ...current, quantity: clampQuantity(current.quantity + v.quantity, v.minQuantity), snapshot };
            } else {
              lines.push({ variantId: v.variantId, quantity: clampQuantity(v.quantity, v.minQuantity), addedAt: Date.now(), snapshot });
            }
          }
          return { lines };
        });
        return usable.length;
      },

      replaceLines: (lines) => set({ lines }),

      clear: () => set({ lines: [] }),
    }),
    {
      name: 'afrisime-cart',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ lines: s.lines }),
    },
  ),
);

/** Corps de POST /v1/cart/validate à partir du panier local. */
export function toValidateRequest(lines: LocalCartLine[]): CartValidateRequest {
  return {
    lines: lines.map((l) => ({
      variantId: l.variantId,
      quantity: l.quantity,
      expectedUnitPrice: l.snapshot.unitPrice,
      expectedAvailability: l.snapshot.availability,
    })),
  };
}

/** Nombre d'articles (badge de l'onglet). Les lignes indisponibles ne comptent pas. */
export function countItems(lines: LocalCartLine[]): number {
  return lines.reduce((n, l) => (l.snapshot.availability === 'unavailable' ? n : n + l.quantity), 0);
}

/** Estimation hors ligne (prix indicatifs). Jamais présentée comme un total définitif. */
export function estimateSubtotal(lines: LocalCartLine[]): number {
  return lines.reduce(
    (sum, l) => (l.snapshot.availability === 'unavailable' ? sum : sum + (l.snapshot.unitPrice ?? 0) * l.quantity),
    0,
  );
}

export const useCartCount = () => useCart((s) => countItems(s.lines));

/** Snapshot local à partir d'une ligne revalidée par le serveur (ligne connue seulement du serveur). */
export function snapshotFromServer(line: ValidatedCartLine): LineSnapshot {
  return {
    productSlug: line.productSlug,
    name: line.productName,
    brand: line.brand,
    variantLabel: line.variantLabel,
    unitPrice: line.unitPrice,
    color: line.color,
    imageUrl: line.imageUrl,
    availability: line.availability,
    leadTimeDays: line.leadTimeDays,
    minQuantity: line.minQuantity,
  };
}
