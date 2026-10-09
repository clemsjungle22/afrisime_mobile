import * as shared from '@afrisime/shared';
import { z } from 'zod';

/**
 * Contrat de l'API au format OpenAPI 3.1, généré depuis les schémas zod de @afrisime/shared :
 * l'app, le back-office (et plus tard AfriGes) lisent la même source de vérité.
 * Les routes s'ajoutent ici au fil des étapes (B2 catalogue, B3 connexion…).
 */
const components = {
  ApiErrorBody: shared.ApiErrorBody,
  Category: shared.Category,
  ProductSummary: shared.ProductSummary,
  ProductDetail: shared.ProductDetail,
  ProductListResponse: shared.ProductListResponse,
  SearchSuggestResponse: shared.SearchSuggestResponse,
  Home: shared.Home,
  OnboardingOptions: shared.OnboardingOptions,
  UserProfile: shared.UserProfile,
  AuthTokens: shared.AuthTokens,
  OtpRequestBody: shared.OtpRequestBody,
  OtpRequestResponse: shared.OtpRequestResponse,
  OtpVerifyBody: shared.OtpVerifyBody,
  OtpVerifyResponse: shared.OtpVerifyResponse,
  RefreshBody: shared.RefreshBody,
  ProfileUpdateBody: shared.ProfileUpdateBody,
  AddressInput: shared.AddressInput,
  ServerCart: shared.ServerCart,
  ServerCartPut: shared.ServerCartPut,
  CartValidateRequest: shared.CartValidateRequest,
  QuoteRequest: shared.QuoteRequest,
  CreateOrderBody: shared.CreateOrderBody,
  CancelOrderBody: shared.CancelOrderBody,
  CreatePaymentBody: shared.CreatePaymentBody,
  ReorderResponse: shared.ReorderResponse,
  AdminProfile: shared.AdminProfile,
  AdminLoginBody: shared.AdminLoginBody,
  AdminLoginResponse: shared.AdminLoginResponse,
  AdminSession: shared.AdminSession,
  AdminTotpBody: shared.AdminTotpBody,
  AdminTotpSetupBody: shared.AdminTotpSetupBody,
  AdminTotpSetupResponse: shared.AdminTotpSetupResponse,
  AdminTotpConfirmBody: shared.AdminTotpConfirmBody,
  AdminChangePasswordBody: shared.AdminChangePasswordBody,
  AdminDashboard: shared.AdminDashboard,
  AdminOrderList: shared.AdminOrderList,
  AdminOrderDetail: shared.AdminOrderDetail,
  AdminTransitionBody: shared.AdminTransitionBody,
  AdminCollectBody: shared.AdminCollectBody,
  AdminCancelBody: shared.AdminCancelBody,
  AdminNoteBody: shared.AdminNoteBody,
  AdminCategory: shared.AdminCategory,
  AdminCategoryInput: shared.AdminCategoryInput,
  AdminCategoryMoveBody: shared.AdminCategoryMoveBody,
  AdminProductList: shared.AdminProductList,
  AdminProductDetail: shared.AdminProductDetail,
  AdminProductCreate: shared.AdminProductCreate,
  AdminProductInput: shared.AdminProductInput,
  AdminNewVariant: shared.AdminNewVariant,
  AdminVariantInput: shared.AdminVariantInput,
  AdminPriceBody: shared.AdminPriceBody,
  AdminPromoBody: shared.AdminPromoBody,
  AdminStockBody: shared.AdminStockBody,
  AdminThresholdBody: shared.AdminThresholdBody,
  AdminStockMovement: shared.AdminStockMovement,
  AdminHome: shared.AdminHome,
  PackList: shared.PackList,
  Carnet: shared.Carnet,
  CarnetList: shared.CarnetList,
  SubscribeBody: shared.SubscribeBody,
  ContributeBody: shared.ContributeBody,
  AdminPack: shared.AdminPack,
  AdminPackInput: shared.AdminPackInput,
  AdminPackFormat: shared.AdminPackFormat,
  AdminCarnetList: shared.AdminCarnetList,
  AdminCarnetDetail: shared.AdminCarnetDetail,
  AdminCashBody: shared.AdminCashBody,
  FavoriteList: shared.FavoriteList,
  ShoppingList: shared.ShoppingList,
  ShoppingListIndex: shared.ShoppingListIndex,
  CreateListBody: shared.CreateListBody,
  RenameListBody: shared.RenameListBody,
  AddListItemBody: shared.AddListItemBody,
  SetListItemBody: shared.SetListItemBody,
  AdminDeliverySettings: shared.AdminDeliverySettings,
  AdminZoneInput: shared.AdminZoneInput,
  AdminCheckoutRules: shared.AdminCheckoutRules,
  AdminSlotSettings: shared.AdminSlotSettings,
  AdminAgency: shared.AdminAgency,
  AdminAgencyInput: shared.AdminAgencyInput,
  AdminCustomerType: shared.AdminCustomerType,
  AdminCustomerTypeInput: shared.AdminCustomerTypeInput,
  AdminMoveBody: shared.AdminMoveBody,
  AdminTeamMember: shared.AdminTeamMember,
  AdminTeamCreate: shared.AdminTeamCreate,
  AdminTeamUpdate: shared.AdminTeamUpdate,
  AdminTeamCredentials: shared.AdminTeamCredentials,
  AdminCustomerList: shared.AdminCustomerList,
  AdminCustomerDetail: shared.AdminCustomerDetail,
  AdminReviewProBody: shared.AdminReviewProBody,
  AdminPricingBody: shared.AdminPricingBody,
  AdminBlockBody: shared.AdminBlockBody,
  AdminBannerInput: shared.AdminBannerInput,
  AdminBannerMoveBody: shared.AdminBannerMoveBody,
  AdminHomeSettingsBody: shared.AdminHomeSettingsBody,
  ValidatedCart: shared.ValidatedCart,
  Address: shared.Address,
  DeliveryOptions: shared.DeliveryOptions,
  Quote: shared.Quote,
  Order: shared.Order,
  OrderList: shared.OrderList,
  PaymentIntent: shared.PaymentIntent,
} satisfies Record<string, z.ZodType>;

function toSchema(schema: z.ZodType) {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, {
    unrepresentable: 'any',
    io: 'output',
  }) as Record<string, unknown>;
  return rest;
}

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorBody' } } },
});

const ref = (name: keyof typeof components) => ({ $ref: `#/components/schemas/${name}` });

/** GET public du catalogue : 200 au format du schéma, 400/404 au format d'erreur commun. */
function publicGet(
  summary: string,
  schema: object,
  options: { params?: object[]; notFound?: boolean } = {},
) {
  return {
    get: {
      summary,
      ...(options.params ? { parameters: options.params } : {}),
      responses: {
        '200': { description: 'OK', content: { 'application/json': { schema } } },
        '400': errorResponse('Paramètres invalides (VALIDATION_ERROR)'),
        ...(options.notFound ? { '404': errorResponse('Introuvable (NOT_FOUND)') } : {}),
      },
    },
  };
}

type Op = {
  summary: string;
  /** Écriture protégée contre les doublons : en-tête Idempotency-Key obligatoire. */
  idempotent?: boolean;
  body?: keyof typeof components;
  response?: object;
  status?: '200' | '201' | '204';
  auth?: boolean;
  errors?: Record<string, string>;
  params?: object[];
};

/** Opération générique : corps JSON, réponse, erreurs au format commun, jeton si `auth`. */
function op({
  summary,
  body,
  response,
  status = '200',
  auth = true,
  errors = {},
  params,
  idempotent,
}: Op) {
  const parameters = [
    ...(params ?? []),
    ...(idempotent
      ? [
          {
            name: 'Idempotency-Key',
            in: 'header',
            required: true,
            schema: { type: 'string', minLength: 8 },
          },
        ]
      : []),
  ];
  return {
    summary,
    ...(auth ? { security: [{ bearer: [] }] } : {}),
    ...(parameters.length ? { parameters } : {}),
    ...(body
      ? { requestBody: { required: true, content: { 'application/json': { schema: ref(body) } } } }
      : {}),
    responses: {
      [status]: response
        ? { description: 'OK', content: { 'application/json': { schema: response } } }
        : { description: 'Sans contenu' },
      ...(body ? { '400': errorResponse('Corps invalide (VALIDATION_ERROR)') } : {}),
      ...(auth
        ? { '401': errorResponse('Non connecté ou session expirée (UNAUTHENTICATED)') }
        : {}),
      ...Object.fromEntries(Object.entries(errors).map(([code, d]) => [code, errorResponse(d)])),
    },
  };
}

const idParam = [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }];

/** Paramètres d'URL d'une liste, dérivés du schéma partagé. */
function productListLikeParams(schema: z.ZodType) {
  const json = toSchema(schema) as { properties: Record<string, object> };
  return Object.entries(json.properties).map(([name, prop]) => ({
    name,
    in: 'query',
    required: false,
    schema: prop,
  }));
}

const productListParameters = () => productListLikeParams(shared.ProductListQuery);

export function buildOpenApi(serverUrl?: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'AfriSime API',
      version: '0.1.0',
      description:
        "API d'AfriSime Virtual Market. Montants en FCFA entiers. Erreurs au format { error: { code, message, requestId } }.",
    },
    servers: serverUrl ? [{ url: serverUrl }] : [],
    paths: {
      '/health': {
        get: {
          summary: 'État du serveur et de la base',
          responses: {
            '200': {
              description: 'Serveur et base opérationnels',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['status', 'database', 'latencyMs', 'time'],
                    properties: {
                      status: { const: 'ok' },
                      database: { const: 'ok' },
                      latencyMs: { type: 'integer' },
                      time: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              },
            },
            '503': errorResponse('Base de données injoignable'),
          },
        },
      },
      '/v1/home': publicGet('Accueil : bannières, rayons et sections', ref('Home')),
      '/v1/categories': publicGet('Rayons et nombre de produits', {
        type: 'array',
        items: ref('Category'),
      }),
      '/v1/products': publicGet(
        'Recherche, filtres, tris, facettes et pagination',
        ref('ProductListResponse'),
        {
          params: productListParameters(),
        },
      ),
      '/v1/products/{slug}': publicGet('Fiche produit', ref('ProductDetail'), {
        params: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
        notFound: true,
      }),
      '/v1/search/suggest': publicGet(
        'Suggestions de saisie et correction',
        ref('SearchSuggestResponse'),
        {
          params: [
            { name: 'q', in: 'query', required: true, schema: { type: 'string', maxLength: 100 } },
          ],
        },
      ),
      '/v1/onboarding/options': publicGet(
        "Listes de l'inscription (types de client, agences, CGU)",
        ref('OnboardingOptions'),
      ),
      '/v1/auth/otp/request': {
        post: op({
          summary: 'Envoyer un code de connexion par SMS',
          auth: false,
          body: 'OtpRequestBody',
          response: ref('OtpRequestResponse'),
          errors: {
            '403': 'Compte suspendu par l’équipe (ACCOUNT_SUSPENDED)',
            '429': 'Trop de demandes (RATE_LIMITED, en-tête Retry-After)',
          },
        }),
      },
      '/v1/auth/otp/verify': {
        post: op({
          summary: 'Vérifier le code et ouvrir une session',
          auth: false,
          body: 'OtpVerifyBody',
          response: ref('OtpVerifyResponse'),
          errors: { '429': "Trop d'essais (OTP_TOO_MANY_ATTEMPTS)" },
        }),
      },
      '/v1/auth/refresh': {
        post: op({
          summary: 'Renouveler la session (rotation)',
          auth: false,
          body: 'RefreshBody',
          response: ref('AuthTokens'),
        }),
      },
      '/v1/auth/logout': {
        post: op({ summary: 'Fermer la session de cet appareil', status: '204' }),
      },
      '/v1/me': {
        get: op({ summary: 'Profil du client connecté', response: ref('UserProfile') }),
        patch: op({
          summary: 'Compléter ou modifier le profil',
          body: 'ProfileUpdateBody',
          response: ref('UserProfile'),
          errors: { '422': 'Type, agence ou CGU inconnus (VALIDATION_ERROR)' },
        }),
      },
      '/v1/me/addresses': {
        get: op({
          summary: 'Adresses du client',
          response: { type: 'array', items: ref('Address') },
        }),
        post: op({
          summary: 'Ajouter une adresse (zone attribuée par le serveur)',
          body: 'AddressInput',
          response: ref('Address'),
          status: '201',
        }),
      },
      '/v1/me/addresses/{id}': {
        patch: op({
          summary: 'Modifier une adresse',
          params: idParam,
          body: 'AddressInput',
          response: ref('Address'),
          errors: { '404': 'Introuvable (NOT_FOUND)' },
        }),
        delete: op({ summary: 'Supprimer une adresse', params: idParam, status: '204' }),
      },
      '/v1/cart': {
        get: op({ summary: 'Panier enregistré', response: ref('ServerCart') }),
        put: op({
          summary: 'Remplacer le panier enregistré (idempotent)',
          body: 'ServerCartPut',
          response: ref('ServerCart'),
        }),
      },
      '/v1/cart/validate': {
        post: {
          ...op({
            summary: 'Revérifier le panier (prix, stock) et lister les changements',
            body: 'CartValidateRequest',
            response: ref('ValidatedCart'),
          }),
          security: [{}, { bearer: [] }],
        },
      },
      '/v1/delivery/options': {
        get: op({
          summary: 'Livraison, retrait en agence et moyens de paiement',
          params: [{ name: 'addressId', in: 'query', required: false, schema: { type: 'string' } }],
          response: ref('DeliveryOptions'),
        }),
      },
      '/v1/checkout/quote': {
        post: op({
          summary: 'Devis final (total garanti pendant sa validité)',
          body: 'QuoteRequest',
          response: ref('Quote'),
          errors: {
            '409':
              'Panier modifié (CART_CHANGED, détail des écarts), rupture ou créneau indisponible',
            '422': 'Zone non desservie, minimum non atteint, moyen de paiement indisponible',
          },
        }),
      },
      '/v1/orders': {
        get: op({
          summary: 'Commandes en cours ou historique',
          params: [
            {
              name: 'status',
              in: 'query',
              required: false,
              schema: { enum: ['active', 'history'] },
            },
            { name: 'cursor', in: 'query', required: false, schema: { type: 'string' } },
          ],
          response: ref('OrderList'),
        }),
        post: op({
          summary: 'Commander sur un devis',
          idempotent: true,
          body: 'CreateOrderBody',
          response: ref('Order'),
          status: '201',
          errors: {
            '409':
              'Devis expiré ou déjà utilisé (QUOTE_EXPIRED), rupture (OUT_OF_STOCK), clé réutilisée (IDEMPOTENCY_CONFLICT)',
          },
        }),
      },
      '/v1/orders/{id}': {
        get: op({
          summary: "Détail et suivi d'une commande",
          params: idParam,
          response: ref('Order'),
          errors: { '404': 'Introuvable (NOT_FOUND)' },
        }),
      },
      '/v1/orders/{id}/cancel': {
        post: op({
          summary: 'Annuler (remboursement si déjà payée)',
          params: idParam,
          body: 'CancelOrderBody',
          response: ref('Order'),
          errors: { '409': 'Déjà en préparation (ORDER_NOT_CANCELLABLE)' },
        }),
      },
      '/v1/orders/{id}/reorder': {
        post: op({
          summary: 'Recommander (articles aux prix du jour)',
          params: idParam,
          response: ref('ReorderResponse'),
        }),
      },
      '/v1/payments': {
        post: op({
          summary: 'Payer en Mobile Money (Mixx by Yas, Moov Money)',
          idempotent: true,
          body: 'CreatePaymentBody',
          response: ref('PaymentIntent'),
          status: '201',
          errors: { '409': "La commande n'attend pas de paiement (ORDER_NOT_PAYABLE)" },
        }),
      },
      '/v1/payments/{id}': {
        get: op({ summary: 'Suivi du paiement', params: idParam, response: ref('PaymentIntent') }),
      },
      // ─── Back-office (session de l'équipe, rôles) ───
      '/v1/admin/auth/login': {
        post: op({
          summary: "Back-office : connexion de l'équipe",
          auth: false,
          body: 'AdminLoginBody',
          response: ref('AdminLoginResponse'),
          errors: { '401': 'Identifiants incorrects', '429': 'Compte ou appareil bloqué 15 min' },
        }),
      },
      '/v1/admin/auth/totp': {
        post: op({
          summary: 'Back-office : code 2FA',
          auth: false,
          body: 'AdminTotpBody',
          response: ref('AdminSession'),
        }),
      },
      '/v1/admin/auth/totp/setup': {
        post: op({
          summary: 'Back-office : activer le 2FA (QR code)',
          auth: false,
          body: 'AdminTotpSetupBody',
          response: ref('AdminTotpSetupResponse'),
        }),
      },
      '/v1/admin/auth/totp/confirm': {
        post: op({
          summary: 'Back-office : confirmer le 2FA',
          auth: false,
          body: 'AdminTotpConfirmBody',
          response: ref('AdminSession'),
        }),
      },
      '/v1/admin/auth/logout': {
        post: op({ summary: 'Back-office : déconnexion', status: '204' }),
      },
      '/v1/admin/me': {
        get: op({
          summary: "Back-office : profil du membre de l'équipe",
          response: ref('AdminProfile'),
        }),
      },
      '/v1/admin/me/password': {
        post: op({
          summary: 'Back-office : changer de mot de passe',
          body: 'AdminChangePasswordBody',
          response: ref('AdminProfile'),
        }),
      },
      '/v1/admin/orders': {
        get: op({
          summary: 'Back-office : commandes par étape (recherche, filtres, compteurs)',
          params: productListLikeParams(shared.AdminOrderListQuery),
          response: ref('AdminOrderList'),
        }),
      },
      '/v1/admin/orders/{id}': {
        get: op({
          summary: 'Back-office : fiche commande',
          params: idParam,
          response: ref('AdminOrderDetail'),
        }),
      },
      '/v1/admin/orders/{id}/transition': {
        post: op({
          summary: 'Back-office : faire franchir une étape',
          params: idParam,
          body: 'AdminTransitionBody',
          response: ref('AdminOrderDetail'),
          errors: {
            '409': 'Commande modifiée entre-temps (ORDER_CHANGED)',
            '422': 'Étape impossible, paiement à encaisser, code de retrait incorrect',
          },
        }),
      },
      '/v1/admin/orders/{id}/collect': {
        post: op({
          summary: 'Back-office : encaisser un paiement à la livraison ou en agence',
          params: idParam,
          body: 'AdminCollectBody',
          response: ref('AdminOrderDetail'),
        }),
      },
      '/v1/admin/orders/{id}/cancel': {
        post: op({
          summary: 'Back-office : annuler (motif obligatoire, remboursement si payée)',
          params: idParam,
          body: 'AdminCancelBody',
          response: ref('AdminOrderDetail'),
        }),
      },
      '/v1/admin/orders/{id}/notes': {
        post: op({
          summary: 'Back-office : note interne',
          params: idParam,
          body: 'AdminNoteBody',
          response: ref('AdminOrderDetail'),
          status: '201',
        }),
      },
      '/v1/admin/catalog/categories': {
        get: op({
          summary: 'Back-office : rayons',
          response: { type: 'array', items: ref('AdminCategory') },
        }),
        post: op({
          summary: 'Back-office : nouveau rayon',
          body: 'AdminCategoryInput',
          response: { type: 'array', items: ref('AdminCategory') },
          status: '201',
        }),
      },
      '/v1/admin/catalog/categories/{id}': {
        patch: op({
          summary: 'Back-office : modifier un rayon',
          params: idParam,
          body: 'AdminCategoryInput',
          response: { type: 'array', items: ref('AdminCategory') },
        }),
      },
      '/v1/admin/catalog/categories/{id}/move': {
        post: op({
          summary: 'Back-office : réordonner un rayon',
          params: idParam,
          body: 'AdminCategoryMoveBody',
          response: { type: 'array', items: ref('AdminCategory') },
        }),
      },
      '/v1/admin/catalog/products': {
        get: op({
          summary: 'Back-office : produits',
          params: productListLikeParams(shared.AdminProductListQuery),
          response: ref('AdminProductList'),
        }),
        post: op({
          summary: 'Back-office : nouveau produit (avec premier format, prix, stock)',
          body: 'AdminProductCreate',
          response: ref('AdminProductDetail'),
          status: '201',
        }),
      },
      '/v1/admin/catalog/products/{id}': {
        get: op({
          summary: 'Back-office : fiche produit (formats, prix, stock)',
          params: idParam,
          response: ref('AdminProductDetail'),
        }),
        patch: op({
          summary: 'Back-office : modifier un produit',
          params: idParam,
          body: 'AdminProductInput',
          response: ref('AdminProductDetail'),
        }),
      },
      '/v1/admin/catalog/products/{id}/image': {
        post: {
          ...op({
            summary: 'Back-office : photo du produit (multipart, champ « file »)',
            params: idParam,
            response: ref('AdminProductDetail'),
          }),
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: { file: { type: 'string', format: 'binary' } },
                },
              },
            },
          },
        },
        delete: op({
          summary: 'Back-office : retirer la photo du produit',
          params: idParam,
          response: ref('AdminProductDetail'),
        }),
      },
      '/v1/admin/catalog/categories/{id}/image': {
        post: {
          ...op({
            summary: 'Back-office : photo du rayon (multipart, champ « file »)',
            params: idParam,
            response: { type: 'array', items: ref('AdminCategory') },
          }),
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: { file: { type: 'string', format: 'binary' } },
                },
              },
            },
          },
        },
        delete: op({
          summary: 'Back-office : retirer la photo du rayon',
          params: idParam,
          response: { type: 'array', items: ref('AdminCategory') },
        }),
      },
      '/v1/admin/catalog/products/{id}/variants': {
        post: op({
          summary: 'Back-office : nouveau format',
          params: idParam,
          body: 'AdminNewVariant',
          response: ref('AdminProductDetail'),
          status: '201',
        }),
      },
      '/v1/admin/catalog/variants/{id}': {
        patch: op({
          summary: 'Back-office : modifier un format',
          params: idParam,
          body: 'AdminVariantInput',
          response: ref('AdminProductDetail'),
        }),
      },
      '/v1/admin/catalog/variants/{id}/prices': {
        post: op({
          summary: 'Back-office : nouveau prix public ou pro',
          params: idParam,
          body: 'AdminPriceBody',
          response: ref('AdminProductDetail'),
          status: '201',
        }),
      },
      '/v1/admin/catalog/variants/{id}/promotions': {
        post: op({
          summary: 'Back-office : promotion datée',
          params: idParam,
          body: 'AdminPromoBody',
          response: ref('AdminProductDetail'),
          status: '201',
        }),
      },
      '/v1/admin/catalog/prices/{id}/end': {
        post: op({
          summary: 'Back-office : arrêter une promotion ou un prix',
          params: idParam,
          response: ref('AdminProductDetail'),
        }),
      },
      '/v1/admin/catalog/variants/{id}/stock': {
        post: op({
          summary: 'Back-office : mouvement de stock motivé',
          params: idParam,
          body: 'AdminStockBody',
          response: ref('AdminProductDetail'),
        }),
      },
      '/v1/admin/catalog/variants/{id}/threshold': {
        post: op({
          summary: "Back-office : seuil d'alerte de stock",
          params: idParam,
          body: 'AdminThresholdBody',
          response: ref('AdminProductDetail'),
        }),
      },
      '/v1/admin/catalog/variants/{id}/movements': {
        get: op({
          summary: 'Back-office : historique des mouvements de stock',
          params: idParam,
          response: { type: 'array', items: ref('AdminStockMovement') },
        }),
      },
      '/v1/admin/home': {
        get: op({
          summary: "Back-office : accueil de l'app (cartes, textes, logo)",
          response: ref('AdminHome'),
        }),
      },
      '/v1/admin/home/settings': {
        put: op({
          summary: 'Back-office : phrase d’accueil et textes des sections',
          body: 'AdminHomeSettingsBody',
          response: ref('AdminHome'),
        }),
      },
      '/v1/admin/home/logo': {
        post: {
          ...op({
            summary: "Back-office : logo de l'en-tête (multipart, champ « file »)",
            response: ref('AdminHome'),
          }),
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: { file: { type: 'string', format: 'binary' } },
                },
              },
            },
          },
        },
        delete: op({
          summary: "Back-office : revenir au logo intégré à l'app",
          response: ref('AdminHome'),
        }),
      },
      '/v1/admin/home/banners': {
        post: op({
          summary: 'Back-office : nouvelle carte défilante',
          body: 'AdminBannerInput',
          response: ref('AdminHome'),
          status: '201',
        }),
      },
      '/v1/admin/home/banners/{id}': {
        patch: op({
          summary: 'Back-office : modifier une carte défilante',
          params: idParam,
          body: 'AdminBannerInput',
          response: ref('AdminHome'),
        }),
        delete: op({
          summary: 'Back-office : supprimer une carte défilante',
          params: idParam,
          response: ref('AdminHome'),
        }),
      },
      '/v1/admin/home/banners/{id}/move': {
        post: op({
          summary: 'Back-office : monter ou descendre une carte',
          params: idParam,
          body: 'AdminBannerMoveBody',
          response: ref('AdminHome'),
        }),
      },
      '/v1/admin/home/banners/{id}/image': {
        post: {
          ...op({
            summary: 'Back-office : photo de fond de la carte (multipart, champ « file »)',
            params: idParam,
            response: ref('AdminHome'),
          }),
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: { file: { type: 'string', format: 'binary' } },
                },
              },
            },
          },
        },
        delete: op({
          summary: 'Back-office : retirer la photo de la carte',
          params: idParam,
          response: ref('AdminHome'),
        }),
      },
      '/v1/admin/customers': {
        get: op({
          summary: 'Back-office : clients (filtres, recherche, compteurs)',
          response: ref('AdminCustomerList'),
        }),
      },
      '/v1/admin/customers/{id}': {
        get: op({
          summary: 'Back-office : fiche client',
          params: idParam,
          response: ref('AdminCustomerDetail'),
        }),
      },
      '/v1/admin/customers/{id}/review': {
        post: op({
          summary: 'Back-office : valider ou refuser un profil pro',
          params: idParam,
          body: 'AdminReviewProBody',
          response: ref('AdminCustomerDetail'),
        }),
      },
      '/v1/admin/customers/{id}/pricing': {
        post: op({
          summary: 'Back-office : changer le profil et le tarif (motif obligatoire)',
          params: idParam,
          body: 'AdminPricingBody',
          response: ref('AdminCustomerDetail'),
        }),
      },
      '/v1/admin/customers/{id}/block': {
        post: op({
          summary: 'Back-office : bloquer un compte client (administrateur)',
          params: idParam,
          body: 'AdminBlockBody',
          response: ref('AdminCustomerDetail'),
        }),
      },
      '/v1/admin/customers/{id}/unblock': {
        post: op({
          summary: 'Back-office : débloquer un compte client (administrateur)',
          params: idParam,
          body: 'AdminBlockBody',
          response: ref('AdminCustomerDetail'),
        }),
      },
      '/v1/admin/settings/delivery': {
        get: op({
          summary: "Paramètres : zones de livraison et règles du checkout",
          response: ref('AdminDeliverySettings'),
        }),
      },
      '/v1/admin/settings/delivery/rules': {
        put: op({
          summary: "Paramètres : livraison offerte, minimum, plafond paiement à la livraison, délai",
          body: 'AdminCheckoutRules',
          response: ref('AdminDeliverySettings'),
        }),
      },
      '/v1/admin/settings/zones': {
        post: op({
          summary: "Paramètres : nouvelle zone de livraison",
          body: 'AdminZoneInput',
          response: ref('AdminDeliverySettings'),
          status: '201',
        }),
      },
      '/v1/admin/settings/zones/{id}': {
        patch: op({
          summary: "Paramètres : modifier une zone",
          params: idParam,
          body: 'AdminZoneInput',
          response: ref('AdminDeliverySettings'),
        }),
      },
      '/v1/admin/settings/zones/{id}/move': {
        post: op({
          summary: "Paramètres : ordre des zones",
          params: idParam,
          body: 'AdminMoveBody',
          response: ref('AdminDeliverySettings'),
        }),
      },
      '/v1/admin/settings/slots': {
        get: op({
          summary: "Paramètres : créneaux (plages, jours fermés, capacité)",
          response: ref('AdminSlotSettings'),
        }),
        put: op({
          summary: "Paramètres : enregistrer les créneaux",
          body: 'AdminSlotSettings',
          response: ref('AdminSlotSettings'),
        }),
      },
      '/v1/admin/settings/agencies': {
        get: op({
          summary: "Paramètres : agences",
          response: { type: 'array', items: ref('AdminAgency') },
        }),
        post: op({
          summary: "Paramètres : nouvelle agence",
          body: 'AdminAgencyInput',
          response: { type: 'array', items: ref('AdminAgency') },
          status: '201',
        }),
      },
      '/v1/admin/settings/agencies/{id}': {
        patch: op({
          summary: "Paramètres : modifier une agence",
          params: idParam,
          body: 'AdminAgencyInput',
          response: { type: 'array', items: ref('AdminAgency') },
        }),
      },
      '/v1/admin/settings/agencies/{id}/default': {
        post: op({
          summary: "Paramètres : agence par défaut",
          params: idParam,
          response: { type: 'array', items: ref('AdminAgency') },
        }),
      },
      '/v1/admin/settings/agencies/{id}/move': {
        post: op({
          summary: "Paramètres : ordre des agences",
          params: idParam,
          body: 'AdminMoveBody',
          response: { type: 'array', items: ref('AdminAgency') },
        }),
      },
      '/v1/admin/settings/customer-types': {
        get: op({
          summary: "Paramètres : profils clients",
          response: { type: 'array', items: ref('AdminCustomerType') },
        }),
        post: op({
          summary: "Paramètres : nouveau profil client",
          body: 'AdminCustomerTypeInput',
          response: { type: 'array', items: ref('AdminCustomerType') },
          status: '201',
        }),
      },
      '/v1/admin/settings/customer-types/{id}': {
        patch: op({
          summary: "Paramètres : modifier un profil client",
          params: idParam,
          body: 'AdminCustomerTypeInput',
          response: { type: 'array', items: ref('AdminCustomerType') },
        }),
      },
      '/v1/admin/settings/customer-types/{id}/move': {
        post: op({
          summary: "Paramètres : ordre des profils",
          params: idParam,
          body: 'AdminMoveBody',
          response: { type: 'array', items: ref('AdminCustomerType') },
        }),
      },
      '/v1/admin/team': {
        get: op({
          summary: "Équipe : comptes",
          response: { type: 'array', items: ref('AdminTeamMember') },
        }),
        post: op({
          summary: "Équipe : nouveau compte (mot de passe provisoire renvoyé une fois)",
          body: 'AdminTeamCreate',
          response: ref('AdminTeamCredentials'),
          status: '201',
        }),
      },
      '/v1/admin/team/{id}': {
        patch: op({
          summary: "Équipe : rôle, désactivation (sessions fermées)",
          params: idParam,
          body: 'AdminTeamUpdate',
          response: { type: 'array', items: ref('AdminTeamMember') },
        }),
      },
      '/v1/admin/team/{id}/reset-password': {
        post: op({
          summary: "Équipe : nouveau mot de passe provisoire",
          params: idParam,
          response: ref('AdminTeamCredentials'),
        }),
      },
      '/v1/admin/team/{id}/reset-totp': {
        post: op({
          summary: "Équipe : réinitialiser la double authentification",
          params: idParam,
          response: { type: 'array', items: ref('AdminTeamMember') },
        }),
      },
      '/v1/admin/team/{id}/unlock': {
        post: op({
          summary: "Équipe : débloquer après trop d’essais",
          params: idParam,
          response: { type: 'array', items: ref('AdminTeamMember') },
        }),
      },
      '/v1/me/favorites': {
        get: op({
          summary: "Produits favoris, au prix du moment",
          response: ref('FavoriteList'),
        }),
      },
      '/v1/me/favorites/{productId}': {
        put: op({
          summary: "Ajouter aux favoris (rejouable)",
          params: [{ name: 'productId', in: 'path', required: true, schema: { type: 'string' } }],
          response: ref('FavoriteList'),
        }),
        delete: op({
          summary: "Retirer des favoris",
          params: [{ name: 'productId', in: 'path', required: true, schema: { type: 'string' } }],
          response: ref('FavoriteList'),
        }),
      },
      '/v1/me/lists': {
        get: op({
          summary: "Listes d'achats",
          response: ref('ShoppingListIndex'),
        }),
        post: op({
          summary: "Nouvelle liste (vide, avec produits ou copie d’une commande)",
          body: 'CreateListBody',
          response: ref('ShoppingList'),
          status: '201',
        }),
      },
      '/v1/me/lists/{id}': {
        get: op({
          summary: "Liste revalidée au prix et au stock du moment",
          params: idParam,
          response: ref('ShoppingList'),
        }),
        patch: op({
          summary: "Renommer une liste",
          params: idParam,
          body: 'RenameListBody',
          response: ref('ShoppingList'),
        }),
        delete: op({
          summary: "Supprimer une liste",
          params: idParam,
          response: ref('ShoppingListIndex'),
        }),
      },
      '/v1/me/lists/{id}/items': {
        post: op({
          summary: "Ajouter un format (quantité cumulée)",
          params: idParam,
          body: 'AddListItemBody',
          response: ref('ShoppingList'),
        }),
      },
      '/v1/me/lists/{id}/items/{variantId}': {
        patch: op({
          summary: "Quantité d'un format de la liste",
          params: [...idParam, { name: 'variantId', in: 'path', required: true, schema: { type: 'string' } }],
          body: 'SetListItemBody',
          response: ref('ShoppingList'),
        }),
        delete: op({
          summary: "Retirer un format de la liste",
          params: [...idParam, { name: 'variantId', in: 'path', required: true, schema: { type: 'string' } }],
          response: ref('ShoppingList'),
        }),
      },
      '/v1/packs': {
        get: op({
          summary: "Packs Famille proposés",
          auth: false,
          response: ref('PackList'),
        }),
      },
      '/v1/me/carnets': {
        get: op({
          summary: "Carnets du client",
          response: ref('CarnetList'),
        }),
        post: op({
          summary: "Souscrire à un pack (contenu et prix figés)",
          idempotent: true,
          body: 'SubscribeBody',
          response: ref('Carnet'),
          status: '201',
        }),
      },
      '/v1/me/carnets/{id}': {
        get: op({
          summary: "Carnet : progression, retard, historique",
          params: idParam,
          response: ref('Carnet'),
        }),
      },
      '/v1/me/carnets/{id}/contributions': {
        post: op({
          summary: "Cotiser par Mobile Money",
          idempotent: true,
          params: idParam,
          body: 'ContributeBody',
          response: ref('Carnet'),
          status: '201',
        }),
      },
      '/v1/admin/packs': {
        get: op({
          summary: "Back-office : packs",
          response: { type: 'array', items: ref('AdminPack') },
        }),
        post: op({
          summary: "Back-office : nouveau pack",
          body: 'AdminPackInput',
          response: { type: 'array', items: ref('AdminPack') },
          status: '201',
        }),
      },
      '/v1/admin/packs/formats': {
        get: op({
          summary: 'Back-office : formats du catalogue à composer dans un pack',
          response: { type: 'array', items: ref('AdminPackFormat') },
        }),
      },
      '/v1/admin/packs/{id}': {
        patch: op({
          summary: "Back-office : modifier un pack",
          params: idParam,
          body: 'AdminPackInput',
          response: { type: 'array', items: ref('AdminPack') },
        }),
      },
      '/v1/admin/packs/{id}/image': {
        post: op({
          summary: "Back-office : photo du pack (multipart, champ « file »)",
          params: idParam,
          response: { type: 'array', items: ref('AdminPack') },
        }),
        delete: op({
          summary: "Back-office : retirer la photo du pack",
          params: idParam,
          response: { type: 'array', items: ref('AdminPack') },
        }),
      },
      '/v1/admin/carnets': {
        get: op({
          summary: "Back-office : carnets des clients",
          response: ref('AdminCarnetList'),
        }),
      },
      '/v1/admin/carnets/{id}': {
        get: op({
          summary: "Back-office : fiche d’un carnet",
          params: idParam,
          response: ref('AdminCarnetDetail'),
        }),
      },
      '/v1/admin/carnets/{id}/cash': {
        post: op({
          summary: "Back-office : cotisation reçue en espèces",
          params: idParam,
          body: 'AdminCashBody',
          response: ref('AdminCarnetDetail'),
        }),
      },
      '/v1/admin/dashboard': {
        get: op({
          summary: 'Back-office : tableau de bord',
          response: ref('AdminDashboard'),
          errors: { '403': 'Rôle insuffisant ou mot de passe provisoire à changer' },
        }),
      },
    },
    components: {
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas: Object.fromEntries(
        Object.entries(components).map(([name, schema]) => [name, toSchema(schema)]),
      ),
    },
  };
}
