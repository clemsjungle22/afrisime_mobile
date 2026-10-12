import {
  CreateOrderBody,
  CreatePaymentBody,
  Order,
  OrderList,
  PaymentIntent,
  ReorderResponse,
} from '@afrisime/shared';
import { request } from '@/api/client';
import { apiConfig } from '@/api/config';
import { mockOrdersApi } from '@/api/mock/orders';

export type OrderFilter = 'active' | 'history';

export type OrdersApi = {
  /** Idempotency-Key obligatoire : générée une fois par devis, réutilisée à chaque nouvelle tentative. */
  createOrder(quoteId: string, idempotencyKey: string): Promise<Order>;
  /** Idempotency-Key obligatoire : une par tentative de paiement (RB-003). */
  createPayment(body: CreatePaymentBody, idempotencyKey: string): Promise<PaymentIntent>;
  getPayment(paymentId: string, signal?: AbortSignal): Promise<PaymentIntent>;
  listOrders(filter: OrderFilter, cursor?: string, signal?: AbortSignal): Promise<OrderList>;
  getOrder(orderId: string, signal?: AbortSignal): Promise<Order>;
  reorder(orderId: string): Promise<ReorderResponse>;
};

const httpOrdersApi: OrdersApi = {
  createOrder(quoteId, idempotencyKey) {
    return request('/v1/orders', {
      method: 'POST',
      body: CreateOrderBody.parse({ quoteId }),
      schema: Order,
      idempotencyKey,
    });
  },
  createPayment(body, idempotencyKey) {
    return request('/v1/payments', {
      method: 'POST',
      body: CreatePaymentBody.parse(body),
      schema: PaymentIntent,
      idempotencyKey,
    });
  },
  getPayment(paymentId, signal) {
    return request(`/v1/payments/${encodeURIComponent(paymentId)}`, { schema: PaymentIntent, signal });
  },
  listOrders(filter, cursor, signal) {
    return request('/v1/orders', { query: { status: filter, cursor }, schema: OrderList, signal });
  },
  getOrder(orderId, signal) {
    return request(`/v1/orders/${encodeURIComponent(orderId)}`, { schema: Order, signal });
  },
  reorder(orderId) {
    return request(`/v1/orders/${encodeURIComponent(orderId)}/reorder`, {
      method: 'POST',
      schema: ReorderResponse,
      safe: true,
    });
  },
};

export const ordersApi: OrdersApi = apiConfig.mock ? mockOrdersApi : httpOrdersApi;
