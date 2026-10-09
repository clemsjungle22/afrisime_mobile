import { CreditAccount, CreditRequestBody, RepayBody } from '@afrisime/shared';
import { request } from '@/api/client';
import { apiConfig } from '@/api/config';
import { mockCreditApi } from '@/api/mock/credit';

/** Vente à crédit (comptes pros). Le statut d'un remboursement vient toujours du serveur. */
export type CreditApi = {
  getAccount(signal?: AbortSignal): Promise<CreditAccount>;
  request(body: CreditRequestBody): Promise<CreditAccount>;
  /** Idempotency-Key obligatoire : jamais deux débits (RB-003). */
  repay(body: RepayBody, idempotencyKey: string): Promise<CreditAccount>;
};

const httpCreditApi: CreditApi = {
  getAccount(signal) {
    return request('/v1/me/credit', { schema: CreditAccount, signal });
  },
  request(body) {
    return request('/v1/me/credit/requests', { method: 'POST', body: CreditRequestBody.parse(body), schema: CreditAccount });
  },
  repay(body, idempotencyKey) {
    return request('/v1/me/credit/repayments', {
      method: 'POST',
      body: RepayBody.parse(body),
      schema: CreditAccount,
      idempotencyKey,
    });
  },
};

export const creditApi: CreditApi = apiConfig.mock ? mockCreditApi : httpCreditApi;
