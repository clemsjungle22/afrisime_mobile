import type { z } from 'zod';
import { ApiError, networkErrorMessage } from '../errors';

const MIN_LATENCY_MS = 300;
const MAX_LATENCY_MS = 1500;
const NETWORK_ERROR_RATE = 0.05;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Simule un appel réseau réel : latence 300–1500 ms, ~5 % d'erreurs réseau,
 * et validation de la réponse par le schéma partagé (le mock respecte le contrat).
 */
export async function simulate<S extends z.ZodType>(
  schema: S,
  produce: () => unknown,
): Promise<z.infer<S>> {
  await sleep(MIN_LATENCY_MS + Math.random() * (MAX_LATENCY_MS - MIN_LATENCY_MS));
  if (Math.random() < NETWORK_ERROR_RATE) {
    throw new ApiError({ code: 'NETWORK_ERROR', message: networkErrorMessage });
  }
  return schema.parse(produce());
}

export function mockError(code: string, message: string, status: number, details?: unknown): ApiError {
  return new ApiError({ code, message, status, details, requestId: `mock_${Date.now()}` });
}
