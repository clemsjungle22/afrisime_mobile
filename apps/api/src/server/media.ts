import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MEDIA_MAX_BYTES } from '@afrisime/shared';
import sharp from 'sharp';
import { env } from './env';
import { ApiError } from './http/errors';
import { log } from './log';

/**
 * Photos du catalogue. Le stockage est derrière une interface : disque du serveur en développement,
 * stockage objet (S3, Cloudflare R2, Supabase Storage…) à brancher au moment de l'hébergement.
 * Les adresses enregistrées en base sont relatives (/media/…) : elles ne dépendent pas de l'hébergeur.
 */
export interface MediaStorage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ data: Buffer; contentType: string } | null>;
  remove(key: string): Promise<void>;
}

/** Clé sûre : dossier/fichier en minuscules, sans « .. » ni chemin absolu. */
const SAFE_KEY = /^[a-z0-9_-]+\/[a-z0-9_.-]+$/;
export const isSafeKey = (key: string) => SAFE_KEY.test(key) && !key.includes('..');

function diskStorage(root: string): MediaStorage {
  const file = (key: string) => {
    if (!isSafeKey(key)) throw new Error(`Clé de média refusée : ${key}`);
    return path.join(root, key);
  };
  return {
    async put(key, data) {
      await mkdir(path.dirname(file(key)), { recursive: true });
      await writeFile(file(key), data);
    },
    async get(key) {
      if (!isSafeKey(key)) return null;
      try {
        return {
          data: await readFile(file(key)),
          contentType: key.endsWith('.webp') ? 'image/webp' : 'application/octet-stream',
        };
      } catch {
        return null;
      }
    },
    async remove(key) {
      if (isSafeKey(key)) await rm(file(key), { force: true });
    },
  };
}

let override: MediaStorage | null = null;

/** Tests : stockage en mémoire. */
export function setMediaStorage(storage: MediaStorage | null) {
  override = storage;
}

export function mediaStorage(): MediaStorage {
  return override ?? diskStorage(path.resolve(env().MEDIA_DIR));
}

export const keyOf = (url: string | null) =>
  url?.startsWith('/media/') ? url.slice('/media/'.length) : null;

/**
 * Prépare une photo envoyée par l'équipe : format vérifié par son contenu (pas par son nom),
 * orientation corrigée, mise à la bonne taille, WebP compressé (léger à charger en 3G/4G).
 */
export type ImageShape =
  /** Recadrée pour remplir exactement la taille (photos produit, rayon, bannière). */
  | { width: number; height: number; fit: 'cover' }
  /** Réduite pour tenir dans la taille, sans recadrage ni fond (logo, transparence conservée). */
  | { width: number; height: number; fit: 'inside' };

export async function processImage(data: Buffer, shape: ImageShape | number): Promise<Buffer> {
  const { width, height, fit } =
    typeof shape === 'number' ? { width: shape, height: shape, fit: 'cover' as const } : shape;
  if (data.byteLength > MEDIA_MAX_BYTES) {
    throw new ApiError(
      'VALIDATION_ERROR',
      'Photo trop lourde (5 Mo maximum).',
      { field: 'file' },
      422,
    );
  }
  let format: string | undefined;
  try {
    format = (await sharp(data).metadata()).format;
  } catch {
    format = undefined;
  }
  if (!format || !['jpeg', 'png', 'webp'].includes(format)) {
    throw new ApiError(
      'VALIDATION_ERROR',
      'Formats acceptés : JPEG, PNG ou WebP.',
      { field: 'file' },
      422,
    );
  }
  const image = sharp(data, { limitInputPixels: 40_000_000 }).rotate();
  return (
    fit === 'cover'
      ? image.resize(width, height, { fit: 'cover', position: 'attention' })
      : image.resize(width, height, { fit: 'inside', withoutEnlargement: true })
  )
    .webp({ quality: fit === 'inside' ? 90 : 80, alphaQuality: 100 })
    .toBuffer();
}

/** Enregistre une photo et renvoie son adresse publique (relative). */
export async function storeImage(
  folder: 'products' | 'categories' | 'banners' | 'branding',
  ownerId: string,
  data: Buffer,
  shape: ImageShape | number,
) {
  const processed = await processImage(data, shape);
  const key = `${folder}/${ownerId.toLowerCase().replace(/[^a-z0-9_-]/g, '')}-${Date.now().toString(36)}.webp`;
  await mediaStorage().put(key, processed, 'image/webp');
  return `/media/${key}`;
}

/** Supprime une ancienne photo (sans faire échouer l'opération si elle a déjà disparu). */
export async function removeImage(url: string | null) {
  const key = keyOf(url);
  if (!key) return;
  await mediaStorage()
    .remove(key)
    .catch((error: unknown) => log.warn('ancienne photo non supprimée', { key, error }));
}
