import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  let envError: string | null = null;
  try {
    const { env } = await import('@/server/env');
    env();
  } catch (e: any) {
    envError = e?.message ?? String(e);
  }

  return NextResponse.json({
    hasRawEnv: !!process.env.DATABASE_URL,
    rawPrefix: process.env.DATABASE_URL?.slice(0, 55) ?? null,
    rawLength: process.env.DATABASE_URL?.length ?? 0,
    envError,
    vercelEnv: process.env.VERCEL_ENV,
  });
}