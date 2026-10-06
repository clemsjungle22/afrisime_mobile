import { CartValidateRequest, ValidatedCart } from '@afrisime/shared';
import type { CartApi } from '@/features/cart/api';
import { withRetry } from '../client';
import { buildCartChangeOverrides, validateCart } from './cartEngine';
import { mockProducts, mockStock } from './data/products';
import { useMockScenarios } from './scenarios';
import { simulate } from './simulate';

export const mockCartApi: CartApi = {
  validate(body, signal) {
    return withRetry(
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
      { canRetry: true, signal },
    );
  },
};
