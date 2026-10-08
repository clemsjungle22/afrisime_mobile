import { AuthTokens, RefreshBody } from '@afrisime/shared';
import { refreshSession } from '@/server/auth/sessions';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';

/** Renouvelle la session : nouveau jeton d'accès ET nouveau jeton de renouvellement (rotation). */
export const POST = route({ body: RefreshBody, response: AuthTokens }, ({ body }) =>
  refreshSession(getDb(), body.refreshToken),
);
