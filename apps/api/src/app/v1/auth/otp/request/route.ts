import { OtpRequestBody, OtpRequestResponse } from '@afrisime/shared';
import { clientIp } from '@/server/auth/context';
import { requestOtp } from '@/server/auth/otp';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';

/** Envoie un code de connexion par SMS (délai entre deux demandes, plafonds par numéro et par IP). */
export const POST = route({ body: OtpRequestBody, response: OtpRequestResponse }, ({ req, body }) =>
  requestOtp(getDb(), body.phone, clientIp(req)),
);
