import { z } from 'zod';
import { PhoneE164 } from './auth';
import { CartChange, CartValidateLine, ValidatedCartLine } from './cart';
import { Money } from './money';

// ─── Adresses : GET/POST/PATCH/DELETE /v1/me/addresses ────────────────────────

export const GeoPoint = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  /** Précision en mètres. */
  accuracy: z.number().nonnegative().nullable(),
});
export type GeoPoint = z.infer<typeof GeoPoint>;

export const AddressInput = z.object({
  label: z.string().trim().min(1, 'Donnez un nom à cette adresse').max(40),
  recipientName: z.string().trim().min(2, 'Indiquez le nom du destinataire').max(80),
  phone: PhoneE164,
  district: z.string().trim().min(2, 'Indiquez le quartier').max(80),
  city: z.string().trim().min(2).max(60),
  /** Indispensable à Lomé : « En face de la pharmacie… ». */
  landmark: z.string().trim().min(3, 'Indiquez un repère pour le livreur').max(160),
  instructions: z.string().trim().max(300).nullable(),
  location: GeoPoint.nullable(),
  isDefault: z.boolean(),
});
export type AddressInput = z.infer<typeof AddressInput>;

export const Address = AddressInput.extend({
  id: z.string(),
  /** Zone attribuée par le serveur (null = hors zone desservie). */
  zoneId: z.string().nullable(),
  zoneName: z.string().nullable(),
});
export type Address = z.infer<typeof Address>;

export const AddressList = z.array(Address);

// ─── Options de livraison : GET /v1/delivery/options?addressId= ───────────────

export const Fulfillment = z.enum(['delivery', 'pickup']);
export type Fulfillment = z.infer<typeof Fulfillment>;

export const Slot = z.object({
  id: z.string(),
  /** Début et fin ISO 8601 UTC. */
  start: z.string().datetime(),
  end: z.string().datetime(),
  available: z.boolean(),
  /** Places restantes si limité. */
  remaining: z.number().int().nonnegative().nullable(),
});
export type Slot = z.infer<typeof Slot>;

export const PaymentMethodId = z.enum(['tmoney', 'flooz', 'card', 'cash_on_delivery', 'pay_at_agency']);
export type PaymentMethodId = z.infer<typeof PaymentMethodId>;

export const PaymentMethodOption = z.object({
  id: PaymentMethodId,
  label: z.string(),
  description: z.string().nullable(),
  /** Modes de réception compatibles. */
  fulfillments: z.array(Fulfillment).min(1),
  available: z.boolean(),
  /** Pourquoi indisponible (affiché tel quel). */
  unavailableReason: z.string().nullable(),
});
export type PaymentMethodOption = z.infer<typeof PaymentMethodOption>;

export const DeliveryOption = z.object({
  available: z.boolean(),
  /** Code métier si indisponible (ZONE_NOT_SERVED…) et message lisible. */
  unavailableCode: z.string().nullable(),
  unavailableReason: z.string().nullable(),
  zone: z.object({ id: z.string(), name: z.string() }).nullable(),
  fee: Money,
  /** Livraison offerte à partir de ce sous-total. */
  freeAbove: Money.nullable(),
  minOrderAmount: Money.nullable(),
  slots: z.array(Slot),
});
export type DeliveryOption = z.infer<typeof DeliveryOption>;

export const PickupAgencyOption = z.object({
  agencyId: z.string(),
  name: z.string(),
  address: z.string(),
  openingHours: z.string().nullable(),
  slots: z.array(Slot),
});
export type PickupAgencyOption = z.infer<typeof PickupAgencyOption>;

export const DeliveryOptions = z.object({
  /** null si aucune adresse fournie. */
  delivery: DeliveryOption.nullable(),
  pickup: z.object({ agencies: z.array(PickupAgencyOption) }),
  paymentMethods: z.array(PaymentMethodOption),
});
export type DeliveryOptions = z.infer<typeof DeliveryOptions>;

// ─── Devis final : POST /v1/checkout/quote ─────────────────────────────────────

export const QuoteRequest = z
  .object({
    fulfillment: Fulfillment,
    addressId: z.string().nullable(),
    agencyId: z.string().nullable(),
    slotId: z.string(),
    paymentMethod: PaymentMethodId,
    useCredit: z.boolean(),
    /**
     * Lignes affichées à l'utilisateur, avec les prix vus. Le serveur les revalide (RB-002) :
     * tout écart renvoie CART_CHANGED avec le détail, jamais un total différent en silence.
     */
    lines: z.array(CartValidateLine).min(1).max(200),
  })
  .refine((q) => (q.fulfillment === 'delivery' ? q.addressId !== null : q.agencyId !== null), {
    message: 'Adresse ou agence requise selon le mode de réception',
  });
export type QuoteRequest = z.infer<typeof QuoteRequest>;

export const Quote = z.object({
  quoteId: z.string(),
  /** Le devis doit être utilisé avant cette date (sinon en redemander un). */
  expiresAt: z.string().datetime(),
  fulfillment: Fulfillment,
  addressId: z.string().nullable(),
  agencyId: z.string().nullable(),
  slot: Slot,
  paymentMethod: PaymentMethodId,
  lines: z.array(ValidatedCartLine),
  subtotal: Money,
  deliveryFee: Money,
  discountTotal: Money,
  total: Money,
  currency: z.literal('XOF'),
  /** Texte de réception affichable (« Livraison à Maison — Bè Kpota »). */
  fulfillmentSummary: z.string(),
});
export type Quote = z.infer<typeof Quote>;

/** Détails de l'erreur CART_CHANGED renvoyée par le devis. */
export const CartChangedDetails = z.object({ changes: z.array(CartChange) });
