import { Order, OrderList, PaymentIntent, ReorderResponse } from '@afrisime/shared';
import type { OrdersApi } from '@/features/orders/api';
import { withAuth, withRetry } from '../client';
import { requireUser } from './authServer';
import { mockProducts, mockStock } from '@afrisime/fixtures';
import * as server from './orderServer';
import { simulate } from './simulate';

const read = <T>(run: () => Promise<T>, signal?: AbortSignal) => withRetry(run, { canRetry: true, signal });

const PAGE = 20;

export const mockOrdersApi: OrdersApi = {
  // Écritures avec Idempotency-Key : réessayables, comme en HTTP (même clé à chaque tentative).
  createOrder(quoteId, key) {
    return read(() =>
      withAuth((token) =>
        simulate(Order, async () => server.createOrder((await requireUser(token)).id, { quoteId }, key)),
      ),
    );
  },
  createPayment(body, key) {
    return read(() =>
      withAuth((token) => simulate(PaymentIntent, async () => server.createPayment((await requireUser(token)).id, body, key))),
    );
  },
  getPayment(paymentId, signal) {
    return read(
      () =>
        withAuth((token) => simulate(PaymentIntent, async () => server.getPayment((await requireUser(token)).id, paymentId))),
      signal,
    );
  },
  listOrders(filter, cursor, signal) {
    return read(
      () =>
        withAuth((token) =>
          simulate(OrderList, async () => {
            const all = await server.listOrders((await requireUser(token)).id, filter);
            const start = cursor ? Number(cursor) : 0;
            const items = all.slice(start, start + PAGE).map(
              ({ id, orderNumber, status, createdAt, total, itemCount, fulfillment, fulfillmentSummary, slot, payable }) => ({
                id,
                orderNumber,
                status,
                createdAt,
                total,
                itemCount,
                fulfillment,
                fulfillmentSummary,
                slot,
                payable,
              }),
            );
            return { items, nextCursor: start + PAGE < all.length ? String(start + PAGE) : null };
          }),
        ),
      signal,
    );
  },
  getOrder(orderId, signal) {
    return read(
      () => withAuth((token) => simulate(Order, async () => server.getOrder((await requireUser(token)).id, orderId))),
      signal,
    );
  },
  cancelOrder(orderId) {
    return read(() =>
      withAuth((token) => simulate(Order, async () => server.cancelOrder((await requireUser(token)).id, orderId))),
    );
  },
  reorder(orderId) {
    return read(() =>
      withAuth((token) =>
        simulate(ReorderResponse, async () =>
          server.reorder((await requireUser(token)).id, orderId, { products: mockProducts, stock: mockStock }),
        ),
      ),
    );
  },
};
