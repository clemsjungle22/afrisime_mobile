import type { OtpRequestResponse, OtpVerifyBody, OtpVerifyResponse } from '@afrisime/shared';
import { and, count, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { getProfile } from '../customers/profile';
import type { Db } from '../db/client';
import * as s from '../db/schema';
import { env } from '../env';
import { ApiError } from '../http/errors';
import { newId } from '../ids';
import { log } from '../log';
import { otpMessage, smsSender } from '../sms';
import { createSession } from './sessions';
import { otpHash, randomOtpCode, safeEqual } from './tokens';

export const OTP_TTL_S = 300;
export const RESEND_DELAY_S = 30;
export const MAX_ATTEMPTS = 5;
/** Plafonds anti-abus (et anti-facture SMS) sur une heure glissante. */
export const MAX_PER_PHONE_PER_HOUR = 5;
export const MAX_PER_IP_PER_HOUR = 20;

const HOUR_MS = 3_600_000;

const tooManyAttempts = () => new ApiError('OTP_TOO_MANY_ATTEMPTS', "Trop d'essais. Demandez un nouveau code.");
const expired = () => new ApiError('OTP_EXPIRED', 'Ce code a expiré. Demandez-en un nouveau.');

/** Compte suspendu par l'équipe : aucun code envoyé, connexion refusée avec un message clair. */
async function refuseSuspended(db: Db, phone: string) {
  const [customer] = await db
    .select({ status: s.customers.status })
    .from(s.customers)
    .where(eq(s.customers.phone, phone));
  if (customer && customer.status !== 'active')
    throw new ApiError(
      'ACCOUNT_SUSPENDED',
      'Ce compte est suspendu. Contactez le service client AfriSime.',
    );
}

/** Code de la demande : fixe si OTP_DEV_CODE est défini (interdit en production), sinon aléatoire. */
const generateCode = () => env().OTP_DEV_CODE ?? randomOtpCode();

export async function requestOtp(db: Db, phone: string, ip: string, now = new Date()): Promise<OtpRequestResponse> {
  await refuseSuspended(db, phone);
  const since = new Date(now.getTime() - HOUR_MS);

  const [last] = await db
    .select({ resendAt: s.otpRequests.resendAt })
    .from(s.otpRequests)
    .where(eq(s.otpRequests.phone, phone))
    .orderBy(desc(s.otpRequests.createdAt))
    .limit(1);
  if (last && last.resendAt > now) {
    const retryIn = Math.ceil((last.resendAt.getTime() - now.getTime()) / 1000);
    throw new ApiError('RATE_LIMITED', `Patientez ${retryIn} s avant de redemander un code.`, { retryIn });
  }

  const [[byPhone], [byIp]] = await Promise.all([
    db
      .select({ n: count() })
      .from(s.otpRequests)
      .where(and(eq(s.otpRequests.phone, phone), gt(s.otpRequests.createdAt, since))),
    db
      .select({ n: count() })
      .from(s.otpRequests)
      .where(and(eq(s.otpRequests.ip, ip), gt(s.otpRequests.createdAt, since))),
  ]);
  if ((byPhone?.n ?? 0) >= MAX_PER_PHONE_PER_HOUR || (byIp?.n ?? 0) >= MAX_PER_IP_PER_HOUR) {
    log.warn('demandes de code bloquées', { phone, ip });
    throw new ApiError('RATE_LIMITED', 'Trop de demandes pour ce numéro. Réessayez dans une heure.', {
      retryIn: 3600,
    });
  }

  const id = newId('otp');
  const code = generateCode();
  await db.insert(s.otpRequests).values({
    id,
    phone,
    codeHash: otpHash(id, code),
    ip,
    createdAt: now,
    expiresAt: new Date(now.getTime() + OTP_TTL_S * 1000),
    resendAt: new Date(now.getTime() + RESEND_DELAY_S * 1000),
  });
  await smsSender().send(phone, otpMessage(code));
  return { requestId: id, expiresIn: OTP_TTL_S, resendIn: RESEND_DELAY_S };
}

export async function verifyOtp(db: Db, body: OtpVerifyBody, ip: string, now = new Date()): Promise<OtpVerifyResponse> {
  const [otp] = await db.select().from(s.otpRequests).where(eq(s.otpRequests.id, body.requestId)).limit(1);
  if (!otp || otp.consumedAt || otp.expiresAt <= now) throw expired();
  if (otp.attempts >= MAX_ATTEMPTS) throw tooManyAttempts();
  // Bloqué entre la demande du code et sa saisie.
  await refuseSuspended(db, otp.phone);

  if (!safeEqual(otpHash(otp.id, body.code), otp.codeHash)) {
    // Incrément atomique : deux essais simultanés ne peuvent pas dépasser la limite.
    const [updated] = await db
      .update(s.otpRequests)
      .set({ attempts: sql`${s.otpRequests.attempts} + 1` })
      .where(eq(s.otpRequests.id, otp.id))
      .returning({ attempts: s.otpRequests.attempts });
    const attemptsLeft = MAX_ATTEMPTS - (updated?.attempts ?? MAX_ATTEMPTS);
    if (attemptsLeft <= 0) throw tooManyAttempts();
    throw new ApiError('OTP_INVALID', 'Code incorrect.', { attemptsLeft });
  }

  return db.transaction(async (txn) => {
    const tx = txn as unknown as Db;
    // Un code ne sert qu'une fois, même en cas de double envoi simultané.
    const consumed = await tx
      .update(s.otpRequests)
      .set({ consumedAt: now })
      .where(and(eq(s.otpRequests.id, otp.id), isNull(s.otpRequests.consumedAt)))
      .returning({ id: s.otpRequests.id });
    if (consumed.length === 0) throw expired();

    const [existing] = await tx
      .select({ id: s.customers.id })
      .from(s.customers)
      .where(eq(s.customers.phone, otp.phone));
    const isNewUser = !existing;
    const customerId = existing?.id ?? newId('usr');
    if (isNewUser) {
      await tx.insert(s.customers).values({ id: customerId, phone: otp.phone, createdAt: now, updatedAt: now });
      await tx.insert(s.auditLog).values({
        actorType: 'customer',
        actorId: customerId,
        action: 'customer.created',
        entity: 'customer',
        entityId: customerId,
        ip,
      });
    }
    const tokens = await createSession(tx, customerId, body.device, now);
    const user = await getProfile(tx, customerId);
    return { ...tokens, user, isNewUser };
  });
}
