import { CartValidateRequest, ServerCart, ServerCartPut, ValidatedCart } from '@afrisime/shared';
import type { CartApi } from '@/features/cart/api';
import { withAuth, withRetry } from '../client';
import { requireUser } from './authServer';
import { buildCartChangeOverrides, validateCart } from './cartEngine';
import { mockProducts, mockStock } from '@afrisime/fixtures';
import { loadDb, saveDb } from './db';
import { useMockScenarios } from './scenarios';
import { simulate } from './simulate';

const read = <T>(run: () => Promise<T>, signal?: AbortSignal) => withRetry(run, { canRetry: true, signal });

export const mockCartApi: CartApi = {
  validate(body, signal) {
    return read(
      () =>
        simulate(ValidatedCart, () => {
          const request = CartValidateRequest.parse(body);
          const scenarios = useMockScenarios.getState();
          // Scénario armé : on fige les modifications à partir du panier courant.
          if (scenarios.cartChangeArmed && request.lines.length > 0) {
            scenarios.setOverrides(buildCartChangeOverrides(request, mockProducts));
          }
          return validateCart(request, {
            products: mockProducts,
            stock: mockStock,
            overrides: useMockScenarios.getState().overrides,
          });
        }),
      signal,
    );
  },

  getServerCart(signal) {
    return read(
      () =>
        withAuth((token) =>
          simulate(ServerCart, async () => {
            const user = await requireUser(token);
            const db = await loadDb();
            return db.carts[user.id] ?? { lines: [], updatedAt: new Date().toISOString() };
          }),
        ),
      signal,
    );
  },

  putServerCart(lines) {
    return read(() =>
      withAuth((token) =>
        simulate(ServerCart, async () => {
          const user = await requireUser(token);
          const body = ServerCartPut.parse({ lines });
          const db = await loadDb();
          const cart = { lines: body.lines, updatedAt: new Date().toISOString() };
          await saveDb({ ...db, carts: { ...db.carts, [user.id]: cart } });
          return cart;
        }),
      ),
    );
  },
};
