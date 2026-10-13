# Contrat d'API AfriSime — conventions et endpoints

Le contrat est défini **une seule fois** dans `packages/shared` (schémas zod + types inférés). Le backend valide ses entrées et sorties avec ces schémas, l'app parse les réponses avec les mêmes, et les mocks s'y conforment. Toute modification du contrat commence dans `packages/shared`.

## Conventions

- **REST JSON versionné** : préfixe `/v1`. Documentation OpenAPI générée depuis les schémas.
- **Auth** : `Authorization: Bearer <accessToken>` (courte durée) + refresh token rotatif. Endpoints publics : catalogue, recherche, promotions, agences, auth.
- **Contexte client** : le serveur déduit segment et agence du token. Pour un visiteur, l'en-tête `X-Agency-Id` (optionnel) choisit l'agence.
- **Idempotence** : `Idempotency-Key: <uuid>` obligatoire sur `POST /orders`, `POST /payments`, `POST /credit/repayments`, `POST /carnets/:id/installments`, `POST /refunds`. Même clé + même corps = même réponse ; même clé + corps différent = `409`.
- **Montants** : entiers en FCFA (`amount: 12500`), champ `currency: "XOF"`. Jamais de float.
- **Dates** : ISO 8601 UTC (`2026-10-05T14:30:00Z`) ; affichage en heure locale (Africa/Lome).
- **Téléphone** : format E.164 (`+22890123456`).
- **IDs** : chaînes opaques (UUID/ULID). Numéros lisibles séparés (`orderNumber`).
- **Pagination** : par curseur, `?cursor=…&limit=20` → `{ items, nextCursor }`.
- **Erreurs** : format unique.

```json
{
  "error": {
    "code": "CART_CHANGED",
    "message": "Le prix de certains articles a changé.",
    "details": { "lines": [{ "sku": "RIZ-SAV-5KG", "oldPrice": 4900, "newPrice": 4750 }] },
    "requestId": "req_01J…"
  }
}
```

Codes métier à gérer côté app : `OTP_INVALID`, `OTP_TOO_MANY_ATTEMPTS`, `OTP_EXPIRED`, `CART_CHANGED`, `OUT_OF_STOCK`, `MIN_ORDER_NOT_MET`, `ZONE_NOT_SERVED`, `SLOT_UNAVAILABLE`, `COUPON_INVALID`, `COUPON_NOT_CUMULABLE`, `CREDIT_NOT_ELIGIBLE`, `CREDIT_INSUFFICIENT`, `CREDIT_SUSPENDED`, `PAYMENT_FAILED`, `PAYMENT_EXPIRED`, `ORDER_NOT_CANCELLABLE`, `IDEMPOTENCY_CONFLICT`, `UNAUTHENTICATED`, `FORBIDDEN`, `RATE_LIMITED`, `VALIDATION_ERROR`.

Le client HTTP (`src/api/client.ts`) normalise toute erreur en `ApiError { code, message, details, status, requestId }` et distingue les erreurs réseau (`NETWORK_ERROR`, `TIMEOUT`) pour l'affichage hors-ligne et les retries. Retry automatique uniquement sur les GET et les requêtes idempotentes (avec leur clé), jamais sur un POST sans clé.

## Endpoints MVP (phase 2)

### Auth (US-001)
| Méthode | Route | Rôle |
|---|---|---|
| POST | `/v1/auth/otp/request` | `{ phone }` → envoie l'OTP (rate limité) → `{ requestId, expiresIn, resendIn }` |
| POST | `/v1/auth/otp/verify` | `{ requestId, code, device }` → `{ accessToken, refreshToken, user, isNewUser }` |
| POST | `/v1/auth/refresh` | `{ refreshToken }` → nouveaux tokens |
| POST | `/v1/auth/logout` | Révoque la session courante |
| GET | `/v1/me` | Profil, segment, agence, consentements |
| PATCH | `/v1/me` | Profil, préférences, agence de référence |
| GET/DELETE | `/v1/me/sessions[/:id]` | Appareils connectés |

### Catalogue et recherche (US-002, US-003)
| Méthode | Route | Rôle |
|---|---|---|
| GET | `/v1/home` | Bannières, sections (flash, nouveautés, meilleures ventes, locaux, pour vous), raccourcis |
| GET | `/v1/categories` | Arbre des rayons |
| GET | `/v1/brands` | Marques |
| GET | `/v1/products` | Liste filtrée : `q, category, brand, minPrice, maxPrice, availability, packaging, origin, offer, sort, cursor` → items + `facets` (compteurs par filtre) |
| GET | `/v1/products/:slug` | Fiche, conditionnements, prix contextualisés, disponibilité, associés |
| GET | `/v1/search/suggest?q=` | Suggestions et correction |
| GET | `/v1/agencies` | Agences, horaires, coordonnées |

### Panier et checkout (US-004, US-005)
| Méthode | Route | Rôle |
|---|---|---|
| GET/PUT | `/v1/cart` | Panier serveur (lignes `{ variantId, quantity }`) |
| POST | `/v1/cart/validate` | Revalidation complète → totaux serveur + liste des changements (`CART_CHANGED`) |
| POST/DELETE | `/v1/cart/coupon` | Appliquer/retirer un code |
| GET | `/v1/delivery/options?addressId=` | Modes, zones, frais, créneaux, retrait en agence |
| GET/POST/PATCH/DELETE | `/v1/me/addresses[/:id]` | Adresses |
| POST | `/v1/checkout/quote` | `{ fulfillment, addressId|agencyId, slotId, paymentMethod, useCredit }` → devis final signé (`quoteId`, totaux, expiration) |

### Commande et paiement (US-006, US-007)
| Méthode | Route | Rôle |
|---|---|---|
| POST | `/v1/orders` | `{ quoteId }` + `Idempotency-Key` → commande `pending_payment` (ou `confirmed` si crédit validé / paiement à la livraison) |
| GET | `/v1/orders` | Liste (en cours / historique) |
| GET | `/v1/orders/:id` | Détail, historique des statuts, suivi livraison |
| POST | `/v1/orders/:id/cancel` | Selon statut (RB-009) |
| POST | `/v1/orders/:id/reorder` | Recrée un panier |
| GET | `/v1/orders/:id/receipt` | URL du reçu/facture PDF |
| POST | `/v1/payments` | `{ orderId, method, phone? }` + `Idempotency-Key` → `paymentIntent { id, status, action: { type: 'confirm_on_phone'|'redirect'|'none', url?, instructions? }, expiresAt }` |
| GET | `/v1/payments/:id` | Statut (polling) |
| GET | `/v1/me/transactions` | Historique |

## Endpoints phase 4 (aperçu)

- Livraison : `GET /v1/orders/:id/tracking`, `POST /v1/orders/:id/delivery-rating`.
- Crédit : `GET /v1/credit` (plafond, disponible, encours, prochaine échéance, statut), `POST /v1/credit/simulate`, `POST /v1/credit/applications` (+ upload pièces), `GET /v1/credit/applications`, `GET /v1/credit/contract`, `GET /v1/credit/schedule`, `POST /v1/credit/repayments`, `GET /v1/credit/repayments`.
- Carnets : `GET /v1/carnets/offers`, `POST /v1/carnets`, `GET /v1/carnets[/:id]`, `POST /v1/carnets/:id/installments`.
- Fidélité : `GET /v1/loyalty`, `GET /v1/loyalty/history`, `GET /v1/me/coupons`, `GET /v1/referral`.
- Support : `GET /v1/faq`, `GET/POST /v1/tickets`, `GET /v1/tickets/:id`, `POST /v1/tickets/:id/messages`.
- Notifications : `GET /v1/notifications`, `POST /v1/me/push-tokens`, `PATCH /v1/me/consents`.
- Listes : `GET/POST/DELETE /v1/me/favorites`, `GET/POST/PATCH /v1/me/lists`.

## Exemple de schéma partagé

```ts
// packages/shared/src/catalog.ts
import { z } from 'zod';

export const Money = z.number().int().nonnegative();

export const Availability = z.enum(['available', 'on_order', 'unavailable', 'quote_only']);

export const Variant = z.object({
  id: z.string(),
  sku: z.string(),
  label: z.string(),               // "Sac 5 kg"
  packaging: z.string(),           // "sac"
  price: Money.nullable(),         // null si sur devis
  compareAtPrice: Money.nullable(),
  availability: Availability,
  leadTimeDays: z.number().int().nullable(),
  minQuantity: z.number().int().positive().default(1),
  isPro: z.boolean(),              // format B2B
});

export const ProductSummary = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  brand: z.string(),
  origin: z.enum(['local', 'imported']),
  imageUrl: z.string().url().nullable(),
  badges: z.array(z.enum(['popular', 'promotion', 'new', 'b2b', 'out_of_stock', 'on_order'])),
  priceFrom: Money.nullable(),
  priceTo: Money.nullable(),
  discountPercent: z.number().int().nullable(),
  defaultVariant: Variant,
  variantsCount: z.number().int(),
});

export type ProductSummary = z.infer<typeof ProductSummary>;
```

## Mocks

- Dossier `apps/mobile/src/api/mock/`, activé par `EXPO_PUBLIC_API_MOCK=true`.
- Données de départ réalistes, reprises du catalogue du site : riz parfumé Savana, huile végétale Golfe d'Or, huile Aïcha 25 L, eau minérale Aqua Lomé, gari et maïs Terroir Togo, savon Maison Claire, lait en poudre sur devis, cubes en rupture, huile de palme sur commande…
- Comportements simulés : latence 300–1500 ms, environ 5 % d'erreurs réseau, `CART_CHANGED` déclenchable, paiement qui passe `pending` → `succeeded` après quelques secondes (ou `failed`/`expired` selon le numéro de test), crédit insuffisant au-delà du disponible, OTP de test `123456`.
- Les réponses mock passent par `Schema.parse()` pour garantir la conformité au contrat.
