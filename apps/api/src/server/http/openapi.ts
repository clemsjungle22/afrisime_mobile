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
    },
    components: {
      schemas: Object.fromEntries(Object.entries(components).map(([name, schema]) => [name, toSchema(schema)])),
    },
  };
}
