import { ApiErrorBody } from '@afrisime/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { GET as health } from '@/app/health/route';
import { GET as openapi } from '@/app/v1/openapi.json/route';
import { setDb } from '@/server/db/client';
import { ApiError } from '@/server/http/errors';
import { route } from '@/server/http/route';
import { maskPhone, redact } from '@/server/log';
import { createTestDb } from './pglite';

let t: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  process.env.LOG_LEVEL = 'error';
  t = await createTestDb();
  setDb(t.db);
});
afterAll(async () => {
  setDb(null);
  await t.close();
});
afterEach(() => {
  vi.restoreAllMocks();
});

const req = (url: string, init?: RequestInit) => new Request(`http://localhost${url}`, init);
const silenceErrors = () => vi.spyOn(console, 'error').mockImplementation(() => {});

describe('GET /health', () => {
  it('répond ok quand la base répond', async () => {
    const res = await health(req('/health'));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-request-id')).toMatch(/^req_/);
    expect(await res.json()).toMatchObject({ status: 'ok', database: 'ok' });
  });

  it("503 au format d'erreur commun quand la base est injoignable", async () => {
    silenceErrors();
    setDb({ execute: () => Promise.reject(new Error('down')) } as never);
    const res = await health(req('/health', { headers: { 'x-request-id': 'abc-12345678' } }));
    setDb(t.db);
    expect(res.status).toBe(503);
    const body = ApiErrorBody.parse(await res.json());
    expect(body.error).toMatchObject({ code: 'INTERNAL_ERROR', requestId: 'abc-12345678' });
  });
});

describe('route()', () => {
  const echo = route(
    {
      query: z.object({ n: z.coerce.number().int().positive() }),
      body: z.object({ name: z.string().min(1) }),
      response: z.object({ greeting: z.string(), n: z.number() }),
      status: 201,
    },
    ({ query, body }) => {
      if (body.name === 'interdit') throw new ApiError('FORBIDDEN', 'Non.');
      return { greeting: `Bonjour ${body.name}`, n: query.n };
    },
  );
  const post = (url: string, body: unknown) =>
    echo(req(url, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }));

  it('valide et convertit les entrées', async () => {
    const res = await post('/x?n=2', { name: 'Kossi' });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ greeting: 'Bonjour Kossi', n: 2 });
  });

  it('400 VALIDATION_ERROR avec le détail des champs', async () => {
    const res = await post('/x?n=0', { name: 'Kossi' });
    expect(res.status).toBe(400);
    const body = ApiErrorBody.parse(await res.json());
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(body.error.details)).toContain('"path":"n"');
    expect((await post('/x?n=1', '{pas du json')).status).toBe(400);
  });

  it('erreur métier → statut et code prévus', async () => {
    const res = await post('/x?n=1', { name: 'interdit' });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('FORBIDDEN');
  });

  it('réponse hors contrat → 500 générique, sans fuite', async () => {
    silenceErrors();
    const leaky = route({ response: z.object({ ok: z.boolean() }) }, () => ({ ok: true, secret: 1 }) as never);
    const broken = route({ response: z.object({ ok: z.boolean() }) }, () => ({ ok: 'oui' }) as never);
    expect(await (await leaky(req('/y'))).json()).toEqual({ ok: true }); // champs inconnus retirés
    const res = await broken(req('/y'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});

describe('journaux', () => {
  it('masquent secrets, codes et téléphones', () => {
    expect(maskPhone('+22890123456')).toBe('+228•••••456');
    expect(
      redact({ phone: '+22890123456', code: '123456', refreshToken: 'x', nested: { authorization: 'Bearer y', ok: 1 } }),
    ).toEqual({
      phone: '+228•••••456',
      code: '[masqué]',
      refreshToken: '[masqué]',
      nested: { authorization: '[masqué]', ok: 1 },
    });
  });
});

describe('GET /v1/openapi.json', () => {
  it('publie le contrat généré depuis les schémas partagés', async () => {
    const doc = await openapi(req('/v1/openapi.json')).json();
    expect(doc.openapi).toBe('3.1.0');
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining(['/health', '/v1/home', '/v1/categories', '/v1/products', '/v1/products/{slug}', '/v1/search/suggest', '/v1/auth/otp/verify', '/v1/me/addresses/{id}', '/v1/cart/validate', '/v1/checkout/quote', '/v1/orders/{id}/cancel', '/v1/payments']),
    );
    expect(doc.paths['/v1/products'].get.parameters.map((p: { name: string }) => p.name)).toContain('minPrice');
    expect(Object.keys(doc.components.schemas)).toEqual(
      expect.arrayContaining(['ProductDetail', 'Order', 'ApiErrorBody']),
    );
  });
});
