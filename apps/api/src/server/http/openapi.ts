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
  ValidatedCart: shared.ValidatedCart,
  Address: shared.Address,
  DeliveryOptions: shared.DeliveryOptions,
  Quote: shared.Quote,
  Order: shared.Order,
  OrderList: shared.OrderList,
  PaymentIntent: shared.PaymentIntent,
} satisfies Record<string, z.ZodType>;

function toSchema(schema: z.ZodType) {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, { unrepresentable: 'any', io: 'output' }) as Record<
    string,
    unknown
  >;
  return rest;
}

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorBody' } } },
});

const ref = (name: keyof typeof components) => ({ $ref: `#/components/schemas/${name}` });

/** GET public du catalogue : 200 au format du schéma, 400/404 au format d'erreur commun. */
function publicGet(summary: string, schema: object, options: { params?: object[]; notFound?: boolean } = {}) {
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

/** Paramètres d'URL de GET /v1/products, dérivés du schéma partagé. */
function productListParameters() {
  const json = toSchema(shared.ProductListQuery) as { properties: Record<string, object> };
  return Object.entries(json.properties).map(([name, schema]) => ({ name, in: 'query', required: false, schema }));
}

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
      '/v1/home': publicGet("Accueil : bannières, rayons et sections", ref('Home')),
      '/v1/categories': publicGet('Rayons et nombre de produits', { type: 'array', items: ref('Category') }),
      '/v1/products': publicGet('Recherche, filtres, tris, facettes et pagination', ref('ProductListResponse'), {
        params: productListParameters(),
      }),
      '/v1/products/{slug}': publicGet('Fiche produit', ref('ProductDetail'), {
        params: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
        notFound: true,
      }),
      '/v1/search/suggest': publicGet('Suggestions de saisie et correction', ref('SearchSuggestResponse'), {
        params: [{ name: 'q', in: 'query', required: true, schema: { type: 'string', maxLength: 100 } }],
      }),
      '/v1/onboarding/options': publicGet("Listes de l'inscription (types de client, agences, CGU)", ref('OnboardingOptions')),
    },
    components: {
      schemas: Object.fromEntries(Object.entries(components).map(([name, schema]) => [name, toSchema(schema)])),
    },
  };
}
