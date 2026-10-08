import { MediaUrl } from '@afrisime/shared';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  POST as categoryImageRoute,
  DELETE as deleteCategoryImageRoute,
} from '@/app/v1/admin/catalog/categories/[id]/image/route';
import {
  POST as productImageRoute,
  DELETE as deleteProductImageRoute,
} from '@/app/v1/admin/catalog/products/[id]/image/route';
import { GET as mediaRoute } from '@/app/media/[...key]/route';
import { login } from '@/server/admin/auth';
import { hashPassword } from '@/server/admin/crypto';
import { getCatalog, invalidateCatalog } from '@/server/catalog/service';
import { setDb } from '@/server/db/client';
import * as s from '@/server/db/schema';
import { seedDatabase } from '@/server/db/seed';
import { type MediaStorage, setMediaStorage } from '@/server/media';
import { createTestDb } from './pglite';

let t: Awaited<ReturnType<typeof createTestDb>>;
const files = new Map<string, Buffer>();
const tokens: Record<string, string> = {};

/** Stockage en mémoire : les tests n'écrivent rien sur le disque. */
const memory: MediaStorage = {
  async put(key, data) {
    files.set(key, data);
  },
  async get(key) {
    const data = files.get(key);
    return data ? { data, contentType: 'image/webp' } : null;
  },
  async remove(key) {
    files.delete(key);
  },
};

beforeAll(async () => {
  t = await createTestDb();
  await seedDatabase(t.db);
  setDb(t.db);
  setMediaStorage(memory);
  invalidateCatalog();
  const hash = await hashPassword('mot-de-passe-photos');
  for (const role of ['catalog', 'readonly'] as const) {
    const email = `${role}@photos.test`;
    await t.db
      .insert(s.adminUsers)
      .values({
        id: `adm_media_${role}`,
        email,
        name: `Équipe ${role}`,
        role,
        passwordHash: hash,
        mustChangePassword: false,
      });
    tokens[role] = (
      (await login(
        t.db,
        { email, password: 'mot-de-passe-photos' },
        { ip: '1.1.1.1', userAgent: null },
      )) as { token: string }
    ).token;
  }
});
afterAll(async () => {
  setMediaStorage(null);
  setDb(null);
  invalidateCatalog();
  await t.close();
});

/** Photo de test (rectangulaire, pour vérifier le recadrage carré). */
const photo = (format: 'png' | 'jpeg' = 'png') =>
  sharp({ create: { width: 1200, height: 900, channels: 3, background: '#c2791b' } })
    .toFormat(format)
    .toBuffer();

async function upload(
  handler: typeof productImageRoute,
  url: string,
  id: string,
  data: Buffer | string,
  role = 'catalog',
  name = 'photo.png',
) {
  const form = new FormData();
  form.set('file', new Blob([typeof data === 'string' ? data : new Uint8Array(data)]), name);
  const res = await handler(
    new Request(`http://localhost${url}`, {
      method: 'POST',
      body: form,
      headers: { authorization: `Bearer ${tokens[role]}` },
    }),
    {
      params: Promise.resolve({ id }),
    },
  );
  return { status: res.status, body: await res.json() };
}

const media = async (url: string) => {
  const key = url.replace('/media/', '').split('/');
  return mediaRoute(new Request(`http://localhost${url}`), { params: Promise.resolve({ key }) });
};

describe('photo de produit', () => {
  it('envoyée : recadrée en carré, WebP, servie avec un long cache, visible dans l’app', async () => {
    const res = await upload(
      productImageRoute,
      '/v1/admin/catalog/products/prd_0001/image',
      'prd_0001',
      await photo('jpeg'),
      'catalog',
      'riz.jpg',
    );
    expect(res.status).toBe(200);
    expect(res.body.imageUrl).toMatch(/^\/media\/products\/prd_0001-[a-z0-9]+\.webp$/);
    expect(MediaUrl.safeParse(res.body.imageUrl).success).toBe(true);

    const served = await media(res.body.imageUrl);
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('image/webp');
    expect(served.headers.get('cache-control')).toContain('immutable');
    const meta = await sharp(Buffer.from(await served.arrayBuffer())).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 800, height: 800 });

    invalidateCatalog();
    const riz = (await getCatalog()).bySlug.get('riz-parfume-savana');
    expect(riz?.imageUrl).toBe(res.body.imageUrl);
    expect(riz?.images).toEqual([res.body.imageUrl]);
  });

  it('remplacée : l’ancienne photo est supprimée ; retirée : retour aux initiales', async () => {
    const first = await upload(
      productImageRoute,
      '/v1/admin/catalog/products/prd_0002/image',
      'prd_0002',
      await photo(),
    );
    const second = await upload(
      productImageRoute,
      '/v1/admin/catalog/products/prd_0002/image',
      'prd_0002',
      await photo(),
    );
    expect(second.body.imageUrl).not.toBe(first.body.imageUrl);
    expect((await media(first.body.imageUrl)).status).toBe(404);

    const res = await deleteProductImageRoute(
      new Request('http://localhost/v1/admin/catalog/products/prd_0002/image', {
        method: 'DELETE',
        headers: { authorization: `Bearer ${tokens.catalog}` },
      }),
      { params: Promise.resolve({ id: 'prd_0002' }) },
    );
    expect((await res.json()).imageUrl).toBeNull();
    expect((await media(second.body.imageUrl)).status).toBe(404);
    invalidateCatalog();
    expect((await getCatalog()).bySlug.get('mais-grain-blanc')?.imageUrl).toBeNull();
  });

  it('refusée : pas une image (même nommée .jpg), trop lourde, ou rôle sans droit', async () => {
    const fake = await upload(
      productImageRoute,
      '/v1/admin/catalog/products/prd_0003/image',
      'prd_0003',
      'ceci n’est pas une image',
      'catalog',
      'piege.jpg',
    );
    expect(fake.status).toBe(422);
    expect(fake.body.error.message).toMatch(/JPEG, PNG ou WebP/);
    const huge = await upload(
      productImageRoute,
      '/v1/admin/catalog/products/prd_0003/image',
      'prd_0003',
      Buffer.alloc(6 * 1024 * 1024),
    );
    expect(huge.status).toBe(422);
    expect(huge.body.error.message).toMatch(/5 Mo/);
    const forbidden = await upload(
      productImageRoute,
      '/v1/admin/catalog/products/prd_0003/image',
      'prd_0003',
      await photo(),
      'readonly',
    );
    expect(forbidden.status).toBe(403);
  });
});

describe('photo de rayon', () => {
  it('envoyée puis retirée ; visible dans l’accueil de l’app', async () => {
    const res = await upload(
      categoryImageRoute,
      '/v1/admin/catalog/categories/cat_huiles/image',
      'cat_huiles',
      await photo(),
    );
    const huiles = res.body.find((c: { id: string }) => c.id === 'cat_huiles');
    expect(huiles.imageUrl).toMatch(/^\/media\/categories\/cat_huiles-/);
    const meta = await sharp(
      Buffer.from(await (await media(huiles.imageUrl)).arrayBuffer()),
    ).metadata();
    expect(meta).toMatchObject({ width: 600, height: 600 });
    invalidateCatalog();
    expect((await getCatalog()).categories.find((c) => c.slug === 'huiles')?.imageUrl).toBe(
      huiles.imageUrl,
    );

    const removed = await deleteCategoryImageRoute(
      new Request('http://localhost/v1/admin/catalog/categories/cat_huiles/image', {
        method: 'DELETE',
        headers: { authorization: `Bearer ${tokens.catalog}` },
      }),
      { params: Promise.resolve({ id: 'cat_huiles' }) },
    );
    expect(
      (await removed.json()).find((c: { id: string }) => c.id === 'cat_huiles').imageUrl,
    ).toBeNull();
  });
});

describe('adresses de médias', () => {
  it('chemins dangereux refusés', async () => {
    for (const key of [
      ['..', 'secret'],
      ['products', '..', '..', '.env.local'],
      ['products', 'x.webp%00'],
    ]) {
      const res = await mediaRoute(new Request('http://localhost/media/x'), {
        params: Promise.resolve({ key }),
      });
      expect(res.status).toBe(404);
    }
  });
});
