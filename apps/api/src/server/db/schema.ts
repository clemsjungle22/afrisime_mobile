/**
 * Schéma PostgreSQL d'AfriSime (Drizzle). Source des migrations SQL (npm run db:generate).
 *
 * Principes :
 * - Montants en FCFA ENTIERS (integer), jamais de décimales.
 * - Identifiants texte opaques préfixés (prd_, var_, ord_…) ; les données d'exemple gardent
 *   les mêmes identifiants que l'app en mode démo.
 * - Les règles commerciales (zones, frais, seuils, bannières…) sont des DONNÉES (RB-010).
 * - Aucune dépendance à des fonctions propres à Supabase : PostgreSQL standard uniquement.
 */
import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

// ─── Énumérations ─────────────────────────────────────────────────────────────

export const productOrigin = pgEnum('product_origin', ['local', 'imported']);
/** Mode de vente d'un format : la disponibilité affichée en découle (avec le stock). */
export const saleMode = pgEnum('sale_mode', ['standard', 'on_order', 'quote_only']);
export const bannerTone = pgEnum('banner_tone', ['brand', 'accent', 'neutral']);
export const fulfillment = pgEnum('fulfillment', ['delivery', 'pickup']);
export const paymentMethod = pgEnum('payment_method', [
  'mixx',
  'flooz',
  'card',
  'cash_on_delivery',
  'pay_at_agency',
]);
export const orderStatus = pgEnum('order_status', [
  'pending_payment',
  'payment_failed',
  'confirmed',
  'preparing',
  'ready_for_pickup',
  'out_for_delivery',
  'delivered',
  'completed',
  'cancelled',
  'refunded',
]);
export const paymentStatus = pgEnum('payment_status', [
  'initiated',
  'pending',
  'succeeded',
  'failed',
  'expired',
  'refunded',
]);

// ─── Catalogue ────────────────────────────────────────────────────────────────

export const categories = pgTable('categories', {
  id: text().primaryKey(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  description: text(),
  imageUrl: text(),
  color: text().notNull(),
  parentId: text(),
  sortOrder: integer().notNull().default(0),
  isActive: boolean().notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const products = pgTable(
  'products',
  {
    id: text().primaryKey(),
    slug: text().notNull().unique(),
    name: text().notNull(),
    brand: text().notNull(),
    origin: productOrigin().notNull(),
    categoryId: text()
      .notNull()
      .references(() => categories.id),
    description: text().notNull().default(''),
    imageUrl: text(),
    /** Badges éditoriaux (popular, promotion, new, b2b) ; rupture / sur commande sont calculés. */
    badges: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    sortOrder: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('products_category_idx').on(t.categoryId)],
);

export const productVariants = pgTable(
  'product_variants',
  {
    id: text().primaryKey(),
    productId: text()
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    sku: text().notNull().unique(),
    label: text().notNull(),
    packaging: text().notNull(),
    saleMode: saleMode().notNull().default('standard'),
    leadTimeDays: integer(),
    minQuantity: integer().notNull().default(1),
    isPro: boolean().notNull().default(false),
    sortOrder: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('variants_product_idx').on(t.productId)],
);

/**
 * Prix contextualisés (RB-001) : par format, segment et agence (null = toutes), sur une période.
 * Le prix applicable est le plus spécifique en cours de validité.
 */
export const prices = pgTable(
  'prices',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    variantId: text()
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),
    segment: text().notNull().default('retail'),
    agencyId: text().references(() => agencies.id),
    amount: integer().notNull(),
    compareAtAmount: integer(),
    validFrom: timestamp({ withTimezone: true }).notNull().defaultNow(),
    validTo: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('prices_variant_idx').on(t.variantId, t.segment)],
);

export const agencies = pgTable('agencies', {
  id: text().primaryKey(),
  name: text().notNull(),
  city: text().notNull(),
  address: text().notNull(),
  phone: text(),
  openingHours: text(),
  isDefault: boolean().notNull().default(false),
  isActive: boolean().notNull().default(true),
  sortOrder: integer().notNull().default(0),
  createdAt: createdAt(),
});

/** Stock par format et par agence. La quantité exacte ne quitte jamais le serveur. */
export const stockLevels = pgTable(
  'stock_levels',
  {
    variantId: text()
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),
    agencyId: text()
      .notNull()
      .references(() => agencies.id),
    onHand: integer().notNull().default(0),
    reserved: integer().notNull().default(0),
    lowThreshold: integer().notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.variantId, t.agencyId] })],
);

export const homeBanners = pgTable('home_banners', {
  id: text().primaryKey(),
  /** Petit texte au-dessus du titre (null : texte par défaut du style). */
  eyebrow: text(),
  title: text().notNull(),
  subtitle: text(),
  imageUrl: text(),
  ctaLabel: text(),
  link: text(),
  tone: bannerTone().notNull().default('brand'),
  sortOrder: integer().notNull().default(0),
  isActive: boolean().notNull().default(true),
  startsAt: timestamp({ withTimezone: true }),
  endsAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
});

// ─── Livraison et paramètres ──────────────────────────────────────────────────

export const deliveryZones = pgTable('delivery_zones', {
  id: text().primaryKey(),
  name: text().notNull(),
  fee: integer().notNull(),
  cashOnDelivery: boolean().notNull().default(false),
  /** Quartiers couverts (comparaison sans accents ni casse). */
  districts: text()
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  city: text().notNull().default('Lomé'),
  sortOrder: integer().notNull().default(0),
  isActive: boolean().notNull().default(true),
  createdAt: createdAt(),
});

/** Paramètres commerciaux modifiables sans redéploiement (seuils, délais…). */
export const appSettings = pgTable('app_settings', {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  description: text(),
  updatedAt: updatedAt(),
});

export const customerTypes = pgTable('customer_types', {
  id: text().primaryKey(),
  label: text().notNull(),
  description: text(),
  requiresReview: boolean().notNull().default(false),
  /** Segment tarifaire appliqué une fois le type validé. */
  segment: text().notNull().default('retail'),
  sortOrder: integer().notNull().default(0),
  /** Désactivé : plus proposé à l'inscription ; les clients qui l'ont le gardent. */
  isActive: boolean().notNull().default(true),
});

// ─── Clients et sessions ──────────────────────────────────────────────────────

export const customers = pgTable('customers', {
  id: text().primaryKey(),
  phone: text().notNull().unique(),
  firstName: text(),
  lastName: text(),
  email: text(),
  customerTypeId: text().references(() => customerTypes.id),
  customerTypePending: boolean().notNull().default(false),
  /** Segment tarifaire effectif (attribué par le serveur). */
  segment: text().notNull().default('retail'),
  agencyId: text().references(() => agencies.id),
  marketingConsent: boolean().notNull().default(false),
  termsVersion: text(),
  status: text().notNull().default('active'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Demandes de code OTP : le code n'est JAMAIS stocké en clair. */
export const otpRequests = pgTable(
  'otp_requests',
  {
    id: text().primaryKey(),
    phone: text().notNull(),
    codeHash: text().notNull(),
    attempts: integer().notNull().default(0),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    resendAt: timestamp({ withTimezone: true }).notNull(),
    consumedAt: timestamp({ withTimezone: true }),
    ip: text(),
    createdAt: createdAt(),
  },
  (t) => [index('otp_phone_idx').on(t.phone, t.createdAt)],
);

/** Sessions (une par appareil) : refresh token haché, rotation à chaque renouvellement. */
export const sessions = pgTable(
  'sessions',
  {
    id: text().primaryKey(),
    customerId: text()
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    refreshTokenHash: text().notNull(),
    device: jsonb(),
    createdAt: createdAt(),
    lastUsedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index('sessions_customer_idx').on(t.customerId)],
);

export const addresses = pgTable(
  'addresses',
  {
    id: text().primaryKey(),
    customerId: text()
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    label: text().notNull(),
    recipientName: text().notNull(),
    phone: text().notNull(),
    district: text().notNull(),
    city: text().notNull(),
    landmark: text().notNull(),
    instructions: text(),
    latitude: doublePrecision(),
    longitude: doublePrecision(),
    accuracy: doublePrecision(),
    zoneId: text().references(() => deliveryZones.id),
    isDefault: boolean().notNull().default(false),
    createdAt: createdAt(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index('addresses_customer_idx').on(t.customerId)],
);

/** Panier serveur d'un client connecté (remplacé en entier : PUT idempotent). */
export const carts = pgTable('carts', {
  customerId: text()
    .primaryKey()
    .references(() => customers.id, { onDelete: 'cascade' }),
  lines: jsonb()
    .notNull()
    .default(sql`'[]'::jsonb`),
  version: integer().notNull().default(1),
  updatedAt: updatedAt(),
});

/** Produits favoris d'un client (un produit, pas un format). */
export const favorites = pgTable(
  'favorites',
  {
    customerId: text()
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    productId: text()
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.customerId, t.productId] })],
);

/** Listes d'achats récurrentes : formats et quantités (prix toujours relus au catalogue). */
export const shoppingLists = pgTable(
  'shopping_lists',
  {
    id: text().primaryKey(),
    customerId: text()
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    /** [{ variantId, quantity }] : une ligne par format. */
    lines: jsonb()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('shopping_lists_customer_idx').on(t.customerId)],
);

// ─── Checkout, commandes, paiements ───────────────────────────────────────────

/** Devis signés : une commande n'est acceptée que sur un devis valide et non consommé. */
export const quotes = pgTable('quotes', {
  id: text().primaryKey(),
  customerId: text()
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  payload: jsonb().notNull(),
  total: integer().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  consumedAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
});

/** Numéros de commande lisibles (AFS-2026-000123). */
export const orderNumberSeq = pgSequence('order_number_seq', { startWith: 123 });

export const orders = pgTable(
  'orders',
  {
    id: text().primaryKey(),
    orderNumber: text().notNull().unique(),
    customerId: text()
      .notNull()
      .references(() => customers.id),
    status: orderStatus().notNull(),
    fulfillment: fulfillment().notNull(),
    addressId: text().references(() => addresses.id),
    agencyId: text().references(() => agencies.id),
    fulfillmentSummary: text().notNull(),
    slot: jsonb().notNull(),
    paymentMethod: paymentMethod().notNull(),
    /** État du paiement vu par le client (dernière tentative pour le Mobile Money). */
    paymentStatus: paymentStatus().notNull(),
    currentPaymentId: text(),
    paidAt: timestamp({ withTimezone: true }),
    itemCount: integer().notNull(),
    subtotal: integer().notNull(),
    deliveryFee: integer().notNull(),
    discountTotal: integer().notNull().default(0),
    total: integer().notNull(),
    currency: text().notNull().default('XOF'),
    pickupCode: text(),
    paymentDeadline: timestamp({ withTimezone: true }),
    quoteId: text()
      .notNull()
      .references(() => quotes.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('orders_customer_idx').on(t.customerId, t.createdAt),
    index('orders_status_idx').on(t.status),
    uniqueIndex('orders_quote_uidx').on(t.quoteId),
  ],
);

/** Lignes figées au moment de la commande (prix et libellés ne bougent plus). */
export const orderLines = pgTable(
  'order_lines',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    orderId: text()
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    variantId: text()
      .notNull()
      .references(() => productVariants.id),
    productSlug: text().notNull(),
    productName: text().notNull(),
    brand: text().notNull(),
    variantLabel: text().notNull(),
    color: text().notNull(),
    unitPrice: integer().notNull(),
    quantity: integer().notNull(),
    lineTotal: integer().notNull(),
    /** Ligne exactement telle qu'affichée au client au moment de la commande. */
    snapshot: jsonb().notNull(),
    sortOrder: integer().notNull().default(0),
  },
  (t) => [index('order_lines_order_idx').on(t.orderId)],
);

export const orderStatusEvents = pgTable(
  'order_status_events',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    orderId: text()
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    status: orderStatus().notNull(),
    note: text(),
    actor: text().notNull().default('system'),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('order_events_order_idx').on(t.orderId, t.at)],
);

/** Réservations de stock liées à une commande (libérées à l'annulation / expiration). */
export const stockReservations = pgTable(
  'stock_reservations',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    orderId: text()
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    variantId: text()
      .notNull()
      .references(() => productVariants.id),
    agencyId: text()
      .notNull()
      .references(() => agencies.id),
    quantity: integer().notNull(),
    releasedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('reservations_order_idx').on(t.orderId)],
);

/**
 * Paiements (RB-003) : une référence prestataire ne peut être enregistrée qu'une fois.
 */
export const payments = pgTable(
  'payments',
  {
    id: text().primaryKey(),
    orderId: text()
      .notNull()
      .references(() => orders.id),
    provider: text().notNull(),
    providerReference: text(),
    method: paymentMethod().notNull(),
    phone: text(),
    amount: integer().notNull(),
    status: paymentStatus().notNull(),
    failureReason: text(),
    /** Données propres au prestataire (jamais exposées au client). */
    providerData: jsonb(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    settledAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('payments_order_idx').on(t.orderId),
    index('payments_status_idx').on(t.status),
    uniqueIndex('payments_provider_ref_uidx').on(t.provider, t.providerReference),
  ],
);

/** Webhooks reçus des prestataires : un événement n'est traité qu'une fois. */
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    provider: text().notNull(),
    eventId: text().notNull(),
    payload: jsonb().notNull(),
    receivedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp({ withTimezone: true }),
  },
  (t) => [uniqueIndex('webhook_events_uidx').on(t.provider, t.eventId)],
);

// ─── Transversal ──────────────────────────────────────────────────────────────

/** Idempotence : même clé + même corps = même réponse ; corps différent = 409. */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    key: text().notNull(),
    customerId: text().notNull(),
    route: text().notNull(),
    requestHash: text().notNull(),
    responseStatus: integer(),
    responseBody: jsonb(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.customerId, t.key] })],
);

/** Journal d'audit en ajout seul (RB-005) : qui, quoi, avant/après, quand. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    actorType: text().notNull(),
    actorId: text(),
    action: text().notNull(),
    entity: text().notNull(),
    entityId: text().notNull(),
    before: jsonb(),
    after: jsonb(),
    ip: text(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_entity_idx').on(t.entity, t.entityId)],
);

/**
 * Outbox : événements métier écrits dans la même transaction que le changement,
 * puis poussés vers les systèmes externes (AfriGes plus tard) par un worker.
 */
export const outbox = pgTable(
  'outbox',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    eventType: text().notNull(),
    aggregate: text().notNull(),
    aggregateId: text().notNull(),
    payload: jsonb().notNull(),
    createdAt: createdAt(),
    processedAt: timestamp({ withTimezone: true }),
    attempts: integer().notNull().default(0),
    lastError: text(),
  },
  (t) => [index('outbox_pending_idx').on(t.processedAt, t.createdAt)],
);

// ─── Back-office : comptes de l'équipe ───────────────────────────────────────

export const adminRole = pgEnum('admin_role', [
  'admin',
  'catalog',
  'orders',
  'support',
  'readonly',
]);

/** Comptes de l'équipe AfriSime : séparés des clients, mot de passe haché, 2FA chiffré. */
export const adminUsers = pgTable('admin_users', {
  id: text().primaryKey(),
  email: text().notNull().unique(),
  name: text().notNull(),
  role: adminRole().notNull(),
  passwordHash: text().notNull(),
  mustChangePassword: boolean().notNull().default(true),
  /** Secret 2FA chiffré (AES-256-GCM), null tant que le 2FA n'est pas activé. */
  totpSecret: text(),
  /** Dernier pas de temps 2FA accepté : un même code ne sert qu'une fois. */
  totpLastStep: integer(),
  failedAttempts: integer().notNull().default(0),
  lockedUntil: timestamp({ withTimezone: true }),
  status: text().notNull().default('active'),
  lastLoginAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Sessions de l'équipe : jeton opaque haché, expiration sur inactivité et durée maximale. */
export const adminSessions = pgTable(
  'admin_sessions',
  {
    id: text().primaryKey(),
    adminId: text()
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    tokenHash: text().notNull(),
    ip: text(),
    userAgent: text(),
    createdAt: createdAt(),
    lastUsedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index('admin_sessions_admin_idx').on(t.adminId)],
);

/** Étape de connexion en cours (code 2FA à saisir ou 2FA à activer), valable quelques minutes. */
export const adminChallenges = pgTable('admin_challenges', {
  id: text().primaryKey(),
  adminId: text()
    .notNull()
    .references(() => adminUsers.id, { onDelete: 'cascade' }),
  kind: text().notNull(),
  /** Secret 2FA proposé pendant l'activation (chiffré), avant confirmation. */
  pendingSecret: text(),
  attempts: integer().notNull().default(0),
  ip: text(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  consumedAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
});

/** Notes internes de l'équipe sur une commande (jamais visibles par le client). */
export const orderNotes = pgTable(
  'order_notes',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    orderId: text()
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    adminId: text()
      .notNull()
      .references(() => adminUsers.id),
    text: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('order_notes_order_idx').on(t.orderId, t.createdAt)],
);

/** Historique des mouvements de stock (réception, inventaire, casse, vente…), en ajout seul. */
export const stockMovements = pgTable(
  'stock_movements',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    variantId: text()
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),
    agencyId: text()
      .notNull()
      .references(() => agencies.id),
    delta: integer().notNull(),
    onHandAfter: integer().notNull(),
    reason: text().notNull(),
    note: text(),
    orderId: text(),
    adminId: text(),
    createdAt: createdAt(),
  },
  (t) => [index('stock_movements_variant_idx').on(t.variantId, t.createdAt)],
);
