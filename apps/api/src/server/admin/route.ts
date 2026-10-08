import type { AdminRole } from '@afrisime/shared';
import type { z } from 'zod';
import { getDb } from '../db/client';
import { ApiError } from '../http/errors';
import { type RouteContext, route } from '../http/route';
import { type AdminContext, authenticateAdmin } from './auth';

type Schema = z.ZodType;

type AdminSpec<Q, B, R extends Schema> = {
  /** Rôles autorisés (par défaut : toute l'équipe, lecture seule comprise). */
  roles?: readonly AdminRole[];
  /** Accessible avec un mot de passe provisoire (changement de mot de passe, profil, déconnexion). */
  allowPendingPassword?: boolean;
  query?: Q;
  body?: B;
  response: R;
  status?: number;
};

const ALL_ROLES: readonly AdminRole[] = ['admin', 'catalog', 'orders', 'support', 'readonly'];

/**
 * Adresse du back-office : session de l'équipe obligatoire, rôle vérifié, jamais mise en cache.
 * Les sessions clientes n'y donnent jamais accès (jetons et tables distincts).
 */
export function adminRoute<
  Q extends Schema | undefined = undefined,
  B extends Schema | undefined = undefined,
  R extends Schema = Schema,
>(
  spec: AdminSpec<Q, B, R>,
  handler: (ctx: RouteContext<Q, B> & AdminContext) => Promise<z.input<R>> | z.input<R>,
) {
  const roles = spec.roles ?? ALL_ROLES;
  return route(
    {
      query: spec.query,
      body: spec.body,
      response: spec.response,
      status: spec.status,
      headers: { 'cache-control': 'private, no-store' },
    },
    async (ctx) => {
      const auth = await authenticateAdmin(getDb(), ctx.req);
      if (auth.admin.mustChangePassword && !spec.allowPendingPassword) {
        throw new ApiError('FORBIDDEN', 'Changez votre mot de passe provisoire pour continuer.', {
          reason: 'password_change_required',
        });
      }
      if (!roles.includes(auth.admin.role)) {
        throw new ApiError('FORBIDDEN', 'Votre rôle ne donne pas accès à cette action.', {
          reason: 'role',
        });
      }
      return handler({ ...ctx, ...auth });
    },
  );
}
