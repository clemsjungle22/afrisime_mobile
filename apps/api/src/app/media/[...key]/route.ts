// apps/api/app/health/route.ts — VERSION DEBUG TEMPORAIRE
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  let envError: string | null = null;
  try {
    // on importe statiquement en haut du fichier pour éviter l'import dynamique
  } catch (e) {
    // ...
  }

  return NextResponse.json({
    hasRawEnv: !!process.env.DATABASE_URL,
    rawPrefix: process.env.DATABASE_URL?.slice(0, 55) ?? null,
    rawLength: process.env.DATABASE_URL?.length ?? 0,
    hasAuthSecret: !!process.env.AUTH_SECRET,
    authSecretLength: process.env.AUTH_SECRET?.length ?? 0,
    hasAdminKey: !!process.env.ADMIN_ENCRYPTION_KEY,
    hasOtpDevCode: !!process.env.OTP_DEV_CODE,
    hasOrderSimulation: !!process.env.ORDER_SIMULATION,
    hasSmsProvider: !!process.env.SMS_PROVIDER,
    hasPaymentProvider: !!process.env.PAYMENT_PROVIDER,
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
  });
}