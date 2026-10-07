import { randomBytes } from 'node:crypto';

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

/** Identifiant opaque préfixé, triable dans le temps : `ord_` + horodatage + aléa (base32). */
export function newId(prefix: string): string {
  let time = Date.now();
  let head = '';
  for (let i = 0; i < 9; i++) {
    head = ALPHABET[time % 32] + head;
    time = Math.floor(time / 32);
  }
  const bytes = randomBytes(10);
  let tail = '';
  for (const b of bytes) tail += ALPHABET[b % 32];
  return `${prefix}_${head}${tail}`;
}
