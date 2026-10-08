import { AdminTotpSetupBody, AdminTotpSetupResponse } from '@afrisime/shared';
import { startTotpSetup } from '@/server/admin/auth';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';

/** Activation du 2FA : secret à enregistrer dans l'application (affiché en QR code). */
export const POST = route(
  {
    body: AdminTotpSetupBody,
    response: AdminTotpSetupResponse,
    headers: { 'cache-control': 'private, no-store' },
  },
  ({ body }) => startTotpSetup(getDb(), body.challengeId),
);
