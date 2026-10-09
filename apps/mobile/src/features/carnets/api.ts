import { Carnet, CarnetList, ContributeBody, PackList, SubscribeBody } from '@afrisime/shared';
import { request } from '@/api/client';
import { apiConfig } from '@/api/config';
import { mockCarnetsApi } from '@/api/mock/carnets';

/** Packs Famille et carnets de cotisation. Le statut d'une cotisation vient toujours du serveur. */
export type CarnetsApi = {
  listPacks(signal?: AbortSignal): Promise<PackList>;
  listCarnets(signal?: AbortSignal): Promise<CarnetList>;
  getCarnet(carnetId: string, signal?: AbortSignal): Promise<Carnet>;
  /** Idempotency-Key obligatoire : jamais deux carnets pour un même appui. */
  subscribe(packId: string, idempotencyKey: string): Promise<Carnet>;
  /** Idempotency-Key obligatoire : jamais deux débits (RB-003). */
  contribute(carnetId: string, body: ContributeBody, idempotencyKey: string): Promise<Carnet>;
};

const httpCarnetsApi: CarnetsApi = {
  listPacks(signal) {
    return request('/v1/packs', { schema: PackList, signal, auth: false });
  },
  listCarnets(signal) {
    return request('/v1/me/carnets', { schema: CarnetList, signal });
  },
  getCarnet(carnetId, signal) {
    return request(`/v1/me/carnets/${encodeURIComponent(carnetId)}`, { schema: Carnet, signal });
  },
  subscribe(packId, idempotencyKey) {
    return request('/v1/me/carnets', {
      method: 'POST',
      body: SubscribeBody.parse({ packId }),
      schema: Carnet,
      idempotencyKey,
    });
  },
  contribute(carnetId, body, idempotencyKey) {
    return request(`/v1/me/carnets/${encodeURIComponent(carnetId)}/contributions`, {
      method: 'POST',
      body: ContributeBody.parse(body),
      schema: Carnet,
      idempotencyKey,
    });
  },
};

export const carnetsApi: CarnetsApi = apiConfig.mock ? mockCarnetsApi : httpCarnetsApi;
