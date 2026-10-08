import { ProfileUpdateBody, UserProfile } from '@afrisime/shared';
import { toUserProfile, updateProfile } from '@/server/customers/profile';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';

export const GET = route({ auth: 'required', response: UserProfile }, ({ auth }) =>
  toUserProfile(auth.customer),
);

/** Complète ou modifie le profil. Le segment tarifaire reste décidé par le serveur. */
export const PATCH = route(
  { auth: 'required', body: ProfileUpdateBody, response: UserProfile },
  ({ auth, body }) => updateProfile(getDb(), auth.customer, body),
);
