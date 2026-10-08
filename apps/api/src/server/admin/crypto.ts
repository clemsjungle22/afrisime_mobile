import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';
import { env } from '../env';

// ─── Mots de passe (scrypt) ──────────────────────────────────────────────────

/** Paramètres scrypt (~50 ms par vérification : coûteux pour une attaque, invisible pour l'équipe). */
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 } as const;

function scryptAsync(
  password: string,
  salt: Buffer,
  params: { N: number; r: number; p: number },
  keylen: number,
) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(
      password.normalize('NFKC'),
      salt,
      keylen,
      { ...params, maxmem: SCRYPT.maxmem },
      (err, key) => (err ? reject(err) : resolve(key)),
    ),
  );
}

/** Empreinte au format `scrypt$N$r$p$sel$empreinte` (paramètres stockés : on pourra les durcir plus tard). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT, SCRYPT.keylen);
  return [
    'scrypt',
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const key = await scryptAsync(
    password,
    Buffer.from(salt, 'base64url'),
    { N: Number(n), r: Number(r), p: Number(p) },
    expected.length,
  );
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Empreinte factice : un e-mail inconnu prend le même temps qu'un mauvais mot de passe. */
let dummy: Promise<string> | null = null;
export async function burnPasswordCheck(password: string) {
  dummy ??= hashPassword('mot-de-passe-factice');
  await verifyPassword(password, await dummy);
}

/** Mot de passe provisoire lisible (sans caractères ambigus), 16 caractères. */
export function temporaryPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from(randomBytes(16), (b) => alphabet[b % alphabet.length]).join('');
}

// ─── Codes 2FA (TOTP, RFC 6238) ──────────────────────────────────────────────

export const TOTP_STEP_S = 30;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = BASE32.indexOf(char);
    if (idx < 0) throw new Error('Secret 2FA invalide');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Nouveau secret 2FA (160 bits, base32 : format attendu par les applications d'authentification). */
export const newTotpSecret = () => base32Encode(randomBytes(20));

export const totpStep = (now: Date) => Math.floor(now.getTime() / 1000 / TOTP_STEP_S);

export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const bin = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(bin).padStart(6, '0');
}

/**
 * Vérifie un code (tolérance d'un pas de 30 s avant/après pour les horloges décalées).
 * Retourne le pas reconnu, ou null. L'appelant refuse un pas déjà utilisé (rejeu).
 */
export function verifyTotp(secret: string, code: string, now: Date): number | null {
  const current = totpStep(now);
  for (const step of [current, current - 1, current + 1]) {
    const expected = Buffer.from(totpCode(secret, step));
    const given = Buffer.from(code);
    if (given.length === expected.length && timingSafeEqual(given, expected)) return step;
  }
  return null;
}

export function otpauthUri(secret: string, email: string): string {
  const label = encodeURIComponent(`AfriSime back-office:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent('AfriSime')}&algorithm=SHA1&digits=6&period=${TOTP_STEP_S}`;
}

// ─── Chiffrement au repos (secrets 2FA) ──────────────────────────────────────

/** Clé AES-256 dérivée d'ADMIN_ENCRYPTION_KEY (obligatoire en production), sinon d'AUTH_SECRET. */
function key(): Buffer {
  const material = env().ADMIN_ENCRYPTION_KEY ?? env().AUTH_SECRET;
  return Buffer.from(hkdfSync('sha256', material, 'afrisime', 'admin-totp-secret', 32));
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    data.toString('base64url'),
  ].join('.');
}

export function decrypt(sealed: string): string {
  const [version, iv, tag, data] = sealed.split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Secret chiffré illisible');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
