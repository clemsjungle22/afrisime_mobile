import { DEFAULT_HOME_APPEARANCE, Home } from '@afrisime/shared';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as bannerImageRoute } from '@/app/v1/admin/home/banners/[id]/image/route';
import { POST as moveRoute } from '@/app/v1/admin/home/banners/[id]/move/route';
import { DELETE as deleteRoute, PATCH as patchRoute } from '@/app/v1/admin/home/banners/[id]/route';
import { POST as createRoute } from '@/app/v1/admin/home/banners/route';
import { DELETE as deleteLogoRoute, POST as logoRoute } from '@/app/v1/admin/home/logo/route';
import { GET as adminHomeRoute } from '@/app/v1/admin/home/route';
import { PUT as settingsRoute } from '@/app/v1/admin/home/settings/route';
import { GET as homeRoute } from '@/app/v1/home/route';
import { login } from '@/server/admin/auth';
import { hashPassword } from '@/server/admin/crypto';
import { invalidateCatalog } from '@/server/catalog/service';
import { setDb } from '@/server/db/client';
import * as s from '@/server/db/schema';
import { seedDatabase } from '@/server/db/seed';
import { type MediaStorage, setMediaStorage } from '@/server/media';
import { call } from './call';
import { createTestDb } from './pglite';

let t: Awaited<ReturnType<typeof createTestDb>>;
const files = new Map<string, Buffer>();
const tokens: Record<string, string> = {};
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
  const hash = await hashPassword('mot-de-passe-accueil');
  for (const role of ['catalog', 'orders'] as const) {
    const email = `${role}@accueil.test`;
    await t.db.insert(s.adminUsers).values({
      id: `adm_home_${role}`,
      email,
      name: `Équipe ${role}`,
      role,
      passwordHash: hash,
      mustChangePassword: false,
    });
    tokens[role] = (
      (await login(
        t.db,
        { email, password: 'mot-de-passe-accueil' },
        { ip: '1.1.1.1', userAgent: null },
      )) as {
        token: string;
      }
    ).token;
  }
});
afterAll(async () => {
  setMediaStorage(null);
  setDb(null);
  invalidateCatalog();
  await t.close();
});

const as = (role = 'catalog') => ({ token: tokens[role]! });
/** Accueil vu par l'app (comme un visiteur). */
const appHome = async () => {
  invalidateCatalog();
  return Home.parse((await call(homeRoute, 'GET', '/v1/home')).body);
};

const banner = (overrides: Record<string, unknown> = {}) => ({
  eyebrow: 'TABASKI 2026',
  title: 'Tout pour la fête',
  subtitle: 'Riz, huile et épices livrés à Lomé.',
  ctaLabel: 'Voir les offres',
  link: '/boutique?offer=promotion',
  tone: 'accent',
  isActive: true,
  startsAt: null,
  endsAt: null,
  ...overrides,
});

const upload = async (
  handler: typeof logoRoute,
  url: string,
  params: Record<string, string>,
  data: Buffer,
) => {
  const form = new FormData();
  form.set('file', new Blob([new Uint8Array(data)]), 'image.png');
  const res = await handler(
    new Request(`http://localhost${url}`, {
      method: 'POST',
      body: form,
      headers: { authorization: `Bearer ${tokens.catalog}` },
    }),
    { params: Promise.resolve(params) },
  );
  return { status: res.status, body: await res.json() };
};

describe('cartes défilantes', () => {
  it('créer : visible dans l’app avec son petit texte, à la fin du défilement', async () => {
    const res = await call(createRoute, 'POST', '/v1/admin/home/banners', {
      ...as(),
      body: banner(),
    });
    expect(res.status).toBe(201);
    const created = res.body.banners.at(-1);
    expect(created).toMatchObject({ eyebrow: 'TABASKI 2026', state: 'live' });
    const home = await appHome();
    expect(home.banners.at(-1)).toMatchObject({
      id: created.id,
      eyebrow: 'TABASKI 2026',
      title: 'Tout pour la fête',
      link: '/boutique?offer=promotion',
    });
  });

  it('programmée : invisible avant sa date, terminée après', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const res = await call(createRoute, 'POST', '/v1/admin/home/banners', {
      ...as(),
      body: banner({
        title: 'Rentrée',
        startsAt: future,
        endsAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      }),
    });
    const b = res.body.banners.find((x: { title: string }) => x.title === 'Rentrée');
    expect(b.state).toBe('scheduled');
    expect((await appHome()).banners.map((x) => x.title)).not.toContain('Rentrée');
  });

  it('modifier, désactiver, réordonner, supprimer', async () => {
    const list = (await call(adminHomeRoute, 'GET', '/v1/admin/home', as())).body.banners;
    const first = list[0];
    await call(patchRoute, 'PATCH', `/v1/admin/home/banners/${first.id}`, {
      ...as(),
      params: { id: first.id },
      body: banner({ title: 'Bienvenue chez AfriSime', eyebrow: null, tone: 'brand' }),
    });
    expect((await appHome()).banners[0]).toMatchObject({
      title: 'Bienvenue chez AfriSime',
      eyebrow: null,
    });

    const moved = await call(moveRoute, 'POST', `/v1/admin/home/banners/${first.id}/move`, {
      ...as(),
      params: { id: first.id },
      body: { direction: 'down' },
    });
    expect(moved.body.banners[1].id).toBe(first.id);

    await call(patchRoute, 'PATCH', `/v1/admin/home/banners/${first.id}`, {
      ...as(),
      params: { id: first.id },
      body: banner({ title: 'Bienvenue chez AfriSime', isActive: false }),
    });
    expect((await appHome()).banners.map((b) => b.id)).not.toContain(first.id);

    const deleted = await call(deleteRoute, 'DELETE', `/v1/admin/home/banners/${first.id}`, {
      ...as(),
      params: { id: first.id },
    });
    expect(deleted.body.banners.map((b: { id: string }) => b.id)).not.toContain(first.id);
  });

  it('refusée : bouton sans destination, fin avant début, lien externe', async () => {
    const noLink = await call(createRoute, 'POST', '/v1/admin/home/banners', {
      ...as(),
      body: banner({ link: null }),
    });
    expect(noLink.status).toBe(400);
    const badDates = await call(createRoute, 'POST', '/v1/admin/home/banners', {
      ...as(),
      body: banner({
        startsAt: new Date(Date.now() + 86_400_000).toISOString(),
        endsAt: new Date().toISOString(),
      }),
    });
    expect(badDates.status).toBe(400);
    const external = await call(createRoute, 'POST', '/v1/admin/home/banners', {
      ...as(),
      body: banner({ link: 'https://pirate.example' }),
    });
    expect(external.status).toBe(400);
  });

  it('photo de carte : format paysage 1200 × 640', async () => {
    const id = (await call(adminHomeRoute, 'GET', '/v1/admin/home', as())).body.banners[0].id;
    const png = await sharp({
      create: { width: 900, height: 900, channels: 3, background: '#0f3d2e' },
    })
      .png()
      .toBuffer();
    const res = await upload(bannerImageRoute, `/v1/admin/home/banners/${id}/image`, { id }, png);
    const url = res.body.banners.find((b: { id: string }) => b.id === id).imageUrl;
    expect(url).toMatch(/^\/media\/banners\//);
    const meta = await sharp(files.get(url.replace('/media/', ''))!).metadata();
    expect(meta).toMatchObject({ width: 1200, height: 640, format: 'webp' });
  });
});

describe('textes, sections et logo', () => {
  it('textes d’origine tant que rien n’est réglé', async () => {
    const home = await appHome();
    expect(home.appearance).toEqual(DEFAULT_HOME_APPEARANCE);
    expect(home.sections.find((sct) => sct.type === 'best_sellers')).toMatchObject({
      title: 'Les plus achetés',
      overline: 'LES PRÉFÉRÉS DE LOMÉ',
    });
  });

  it('phrase d’accueil, titres et sections masquées appliqués dans l’app', async () => {
    const res = await call(settingsRoute, 'PUT', '/v1/admin/home/settings', {
      ...as(),
      body: {
        greetingSubtitle: 'Vos courses livrées en 2 heures à Lomé',
        blocks: {
          ...DEFAULT_HOME_APPEARANCE.blocks,
          best_sellers: {
            overline: 'TOP DE LA SEMAINE',
            title: 'Les incontournables',
            visible: true,
          },
          new_arrivals: { ...DEFAULT_HOME_APPEARANCE.blocks.new_arrivals, visible: false },
          categories: { overline: 'EXPLOREZ', title: 'Nos rayons', visible: false },
        },
      },
    });
    expect(res.status).toBe(200);
    const home = await appHome();
    expect(home.appearance?.greetingSubtitle).toBe('Vos courses livrées en 2 heures à Lomé');
    expect(home.sections.find((sct) => sct.type === 'best_sellers')).toMatchObject({
      title: 'Les incontournables',
      overline: 'TOP DE LA SEMAINE',
    });
    expect(home.sections.map((sct) => sct.type)).not.toContain('new_arrivals');
    expect(home.categories).toEqual([]);
  });

  it('logo : transparence conservée, sans recadrage ; retour au logo d’origine', async () => {
    const logo = await sharp({
      create: { width: 840, height: 220, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    const res = await upload(logoRoute, '/v1/admin/home/logo', {}, logo);
    const url = res.body.appearance.logoUrl;
    expect(url).toMatch(/^\/media\/branding\/logo-/);
    const meta = await sharp(files.get(url.replace('/media/', ''))!).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 600, hasAlpha: true });
    expect(meta.height).toBeLessThanOrEqual(200);
    expect((await appHome()).appearance?.logoUrl).toBe(url);
    // Les textes réglés juste avant sont conservés.
    expect((await appHome()).appearance?.greetingSubtitle).toBe(
      'Vos courses livrées en 2 heures à Lomé',
    );

    const removed = await deleteLogoRoute(
      new Request('http://localhost/v1/admin/home/logo', {
        method: 'DELETE',
        headers: { authorization: `Bearer ${tokens.catalog}` },
      }),
      { params: Promise.resolve({}) },
    );
    expect((await removed.json()).appearance.logoUrl).toBeNull();
    expect(files.has(url.replace('/media/', ''))).toBe(false);
  });

  it('rôle Commandes : consulte, ne modifie pas', async () => {
    expect((await call(adminHomeRoute, 'GET', '/v1/admin/home', as('orders'))).status).toBe(200);
    expect(
      (
        await call(createRoute, 'POST', '/v1/admin/home/banners', {
          ...as('orders'),
          body: banner(),
        })
      ).status,
    ).toBe(403);
  });
});
