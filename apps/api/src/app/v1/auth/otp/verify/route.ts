import { OtpVerifyBody, OtpVerifyResponse } from '@afrisime/shared';
import { clientIp } from '@/server/auth/context';
import { verifyOtp } from '@/server/auth/otp';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';

/** Vérifie le code ; crée le compte au premier passage ; ouvre une session pour cet appareil. */
export const POST = route({ body: OtpVerifyBody, response: OtpVerifyResponse }, ({ req, body }) =>
  verifyOtp(getDb(), body, clientIp(req)),
);
