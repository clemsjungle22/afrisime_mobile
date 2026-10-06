/**
 * Numéros de téléphone Togo (+228). Format d'échange API : E.164 (`+22890123456`).
 *
 * [À confirmer par AfriSime] Préfixes mobiles acceptés : 8 chiffres commençant par 7 ou 9
 * (Moov Africa 7x / 9x, Togocel-Yas 9x). Paramétrable ici en un seul endroit.
 */
export const TOGO_DIAL_CODE = '+228';
export const TOGO_NATIONAL_LENGTH = 8;
const TOGO_MOBILE_PATTERN = /^[79]\d{7}$/;

const NBSP = ' ';

/** Garde uniquement les chiffres et retire un éventuel indicatif 228 / 00228 / +228. */
export function nationalDigits(input: string): string {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('00228')) digits = digits.slice(5);
  else if (digits.startsWith('228') && digits.length > TOGO_NATIONAL_LENGTH) digits = digits.slice(3);
  return digits.slice(0, TOGO_NATIONAL_LENGTH);
}

export function isValidTogoMobile(input: string): boolean {
  return TOGO_MOBILE_PATTERN.test(nationalDigits(input));
}

/** Saisie utilisateur → E.164, ou null si invalide. */
export function toE164(input: string): string | null {
  const national = nationalDigits(input);
  return TOGO_MOBILE_PATTERN.test(national) ? `${TOGO_DIAL_CODE}${national}` : null;
}

/** Groupes de 2 chiffres pendant la saisie : « 90 12 34 56 ». */
export function formatNationalInput(input: string): string {
  return nationalDigits(input).replace(/(\d{2})(?=\d)/g, '$1 ');
}

/** Affichage : « +228 90 12 34 56 » (espaces insécables). */
export function formatPhone(e164: string): string {
  const national = nationalDigits(e164);
  return `${TOGO_DIAL_CODE}${NBSP}${national.replace(/(\d{2})(?=\d)/g, `$1${NBSP}`)}`;
}

/** Affichage masqué (écrans, journaux) : « +228 •• •• 34 56 ». */
export function maskPhone(e164: string): string {
  const national = nationalDigits(e164);
  const visible = national.slice(-4);
  return `${TOGO_DIAL_CODE}${NBSP}••${NBSP}••${NBSP}${visible.slice(0, 2)}${NBSP}${visible.slice(2)}`;
}
