import 'server-only';
import { AdminProfile, type AdminRole } from '@afrisime/shared';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { ApiError, api } from './api';

/** Profil de la personne connectée (une seule requête par affichage de page). */
const loadMe = cache(() => api('/v1/admin/me', { schema: AdminProfile }));

/**
 * Exige une session valide : sinon retour à la connexion. Un mot de passe provisoire
 * renvoie vers son changement ; un rôle non autorisé vers le tableau de bord.
 */
export async function requireAdmin(
  options: { roles?: readonly AdminRole[]; allowPendingPassword?: boolean } = {},
) {
  let me: AdminProfile;
  try {
    me = await loadMe();
  } catch (error) {
    if (error instanceof ApiError && error.isUnauthenticated) redirect('/login?etape=expiree');
    throw error;
  }
  if (me.mustChangePassword && !options.allowPendingPassword) redirect('/mot-de-passe');
  if (options.roles && !options.roles.includes(me.role)) redirect('/');
  return me;
}
