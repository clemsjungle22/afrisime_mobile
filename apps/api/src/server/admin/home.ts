import {
  type AdminBanner,
  type AdminBannerInput,
  type AdminHome,
  type AdminHomeSettingsBody,
  type BannerState,
  type HomeAppearance,
} from '@afrisime/shared';
import { asc, eq, sql } from 'drizzle-orm';
import { HOME_APPEARANCE_KEY, invalidateCatalog, loadAppearance } from '../catalog/service';
import type { Db } from '../db/client';
import * as s from '../db/schema';
import { ApiError } from '../http/errors';
import { newId } from '../ids';
import { removeImage, storeImage } from '../media';
import { type AdminContext, adminAudit } from './auth';

/** Photo de bannière : format paysage de la carte (environ 2:1), net sur les grands téléphones. */
const BANNER_SHAPE = { width: 1200, height: 640, fit: 'cover' } as const;
/** Logo : réduit pour tenir dans 600 × 200, sans recadrage, transparence conservée. */
const LOGO_SHAPE = { width: 600, height: 200, fit: 'inside' } as const;

type BannerRow = typeof s.homeBanners.$inferSelect;

const notFound = () => new ApiError('NOT_FOUND', 'Bannière introuvable.');

function stateOf(b: BannerRow, now: Date): BannerState {
  if (!b.isActive) return 'inactive';
  if (b.endsAt && b.endsAt <= now) return 'ended';
  if (b.startsAt && b.startsAt > now) return 'scheduled';
  return 'live';
}

function toAdminBanner(b: BannerRow, now: Date): AdminBanner {
  return {
    id: b.id,
    eyebrow: b.eyebrow,
    title: b.title,
    subtitle: b.subtitle,
    ctaLabel: b.ctaLabel,
    link: b.link,
    tone: b.tone,
    imageUrl: b.imageUrl,
    sortOrder: b.sortOrder,
    isActive: b.isActive,
    startsAt: b.startsAt?.toISOString() ?? null,
    endsAt: b.endsAt?.toISOString() ?? null,
    state: stateOf(b, now),
  };
}

export async function getAdminHome(db: Db, now = new Date()): Promise<AdminHome> {
  const [banners, appearance] = await Promise.all([
    db
      .select()
      .from(s.homeBanners)
      .orderBy(asc(s.homeBanners.sortOrder), asc(s.homeBanners.createdAt)),
    loadAppearance(db),
  ]);
  return { banners: banners.map((b) => toAdminBanner(b, now)), appearance };
}

/** Écriture + audit, puis l'accueil de l'app est rafraîchi. */
async function write<T>(db: Db, run: (tx: Db) => Promise<T>): Promise<T> {
  const result = await db.transaction((txn) => run(txn as unknown as Db));
  invalidateCatalog();
  return result;
}

const audit = (
  tx: Db,
  ctx: AdminContext,
  action: string,
  entityId: string,
  before?: unknown,
  after?: unknown,
) => adminAudit(tx, { actorId: ctx.admin.id, action, entity: 'home', entityId, before, after });

const columns = (input: AdminBannerInput) => ({
  eyebrow: input.eyebrow,
  title: input.title,
  subtitle: input.subtitle,
  ctaLabel: input.ctaLabel,
  link: input.link,
  tone: input.tone,
  isActive: input.isActive,
  startsAt: input.startsAt ? new Date(input.startsAt) : null,
  endsAt: input.endsAt ? new Date(input.endsAt) : null,
});

// ─── Bannières ───────────────────────────────────────────────────────────────

export async function createBanner(db: Db, ctx: AdminContext, input: AdminBannerInput) {
  await write(db, async (tx) => {
    const [last] = await tx
      .select({ max: sql<number>`coalesce(max(${s.homeBanners.sortOrder}), -1)::int` })
      .from(s.homeBanners);
    const id = newId('ban');
    await tx
      .insert(s.homeBanners)
      .values({ id, ...columns(input), sortOrder: (last?.max ?? -1) + 1 });
    await audit(tx, ctx, 'banner.created', id, null, input);
  });
  return getAdminHome(db);
}

export async function updateBanner(db: Db, ctx: AdminContext, id: string, input: AdminBannerInput) {
  await write(db, async (tx) => {
    const [before] = await tx.select().from(s.homeBanners).where(eq(s.homeBanners.id, id));
    if (!before) throw notFound();
    await tx.update(s.homeBanners).set(columns(input)).where(eq(s.homeBanners.id, id));
    await audit(tx, ctx, 'banner.updated', id, before, input);
  });
  return getAdminHome(db);
}

export async function deleteBanner(db: Db, ctx: AdminContext, id: string) {
  const before = await write(db, async (tx) => {
    const [row] = await tx.select().from(s.homeBanners).where(eq(s.homeBanners.id, id));
    if (!row) throw notFound();
    await tx.delete(s.homeBanners).where(eq(s.homeBanners.id, id));
    await audit(tx, ctx, 'banner.deleted', id, row, null);
    return row;
  });
  await removeImage(before.imageUrl);
  return getAdminHome(db);
}

/** Monte ou descend une carte d'un cran (ordre de défilement dans l'app). */
export async function moveBanner(db: Db, ctx: AdminContext, id: string, direction: 'up' | 'down') {
  await write(db, async (tx) => {
    const rows = await tx
      .select({ id: s.homeBanners.id })
      .from(s.homeBanners)
      .orderBy(asc(s.homeBanners.sortOrder), asc(s.homeBanners.createdAt));
    const order = rows.map((r) => r.id);
    const index = order.indexOf(id);
    if (index < 0) throw notFound();
    const other = direction === 'up' ? index - 1 : index + 1;
    if (other < 0 || other >= order.length) return;
    [order[index], order[other]] = [order[other]!, id];
    for (const [i, bannerId] of order.entries()) {
      await tx.update(s.homeBanners).set({ sortOrder: i }).where(eq(s.homeBanners.id, bannerId));
    }
    await audit(tx, ctx, 'banner.moved', id, null, { direction });
  });
  return getAdminHome(db);
}

/** Photo de la carte (remplace le dessin) ; null = retour au dessin du style. */
export async function setBannerImage(db: Db, ctx: AdminContext, id: string, data: Buffer | null) {
  const [row] = await db.select().from(s.homeBanners).where(eq(s.homeBanners.id, id));
  if (!row) throw notFound();
  const url = data ? await storeImage('banners', id, data, BANNER_SHAPE) : null;
  await write(db, async (tx) => {
    await tx.update(s.homeBanners).set({ imageUrl: url }).where(eq(s.homeBanners.id, id));
    await audit(
      tx,
      ctx,
      url ? 'banner.image_set' : 'banner.image_removed',
      id,
      { imageUrl: row.imageUrl },
      { imageUrl: url },
    );
  });
  await removeImage(row.imageUrl);
  return getAdminHome(db);
}

// ─── Textes, sections, logo ──────────────────────────────────────────────────

async function saveAppearance(tx: Db, value: HomeAppearance) {
  await tx
    .insert(s.appSettings)
    .values({
      key: HOME_APPEARANCE_KEY,
      value,
      description: "Apparence de l'accueil de l'app (logo, textes, sections)",
    })
    .onConflictDoUpdate({ target: s.appSettings.key, set: { value, updatedAt: new Date() } });
}

export async function saveHomeSettings(db: Db, ctx: AdminContext, body: AdminHomeSettingsBody) {
  const before = await loadAppearance(db);
  await write(db, async (tx) => {
    await saveAppearance(tx, {
      ...before,
      greetingSubtitle: body.greetingSubtitle,
      blocks: { ...before.blocks, ...body.blocks },
    });
    await audit(tx, ctx, 'home.texts_updated', HOME_APPEARANCE_KEY, before, body);
  });
  return getAdminHome(db);
}

/** Logo de l'en-tête de l'accueil ; null = logo intégré à l'app. */
export async function setLogo(db: Db, ctx: AdminContext, data: Buffer | null) {
  const before = await loadAppearance(db);
  const url = data ? await storeImage('branding', 'logo', data, LOGO_SHAPE) : null;
  await write(db, async (tx) => {
    await saveAppearance(tx, { ...before, logoUrl: url });
    await audit(
      tx,
      ctx,
      url ? 'home.logo_set' : 'home.logo_removed',
      HOME_APPEARANCE_KEY,
      { logoUrl: before.logoUrl },
      { logoUrl: url },
    );
  });
  await removeImage(before.logoUrl);
  return getAdminHome(db);
}
