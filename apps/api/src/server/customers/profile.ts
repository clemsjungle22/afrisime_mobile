import type { ProfileUpdateBody, UserProfile } from '@afrisime/shared';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import * as s from '../db/schema';
import { ApiError } from '../http/errors';

/** Libellé du segment tarifaire (attribué par le serveur, jamais choisi par le client). */
const SEGMENT_LABELS: Record<string, string> = { retail: 'Particulier', pro: 'Professionnel' };

type CustomerRow = typeof s.customers.$inferSelect;

export function toUserProfile(c: CustomerRow): UserProfile {
  const profile: UserProfile = {
    id: c.id,
    phone: c.phone,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    customerTypeId: c.customerTypeId,
    segmentLabel: SEGMENT_LABELS[c.segment] ?? c.segment,
    customerTypePending: c.customerTypePending,
    agencyId: c.agencyId,
    consents: { marketing: c.marketingConsent, termsVersion: c.termsVersion },
    profileComplete: false,
    createdAt: c.createdAt.toISOString(),
  };
  profile.profileComplete = Boolean(
    profile.firstName && profile.lastName && profile.customerTypeId && profile.agencyId && profile.consents.termsVersion,
  );
  return profile;
}

export async function getProfile(db: Db, customerId: string): Promise<UserProfile> {
  const [row] = await db.select().from(s.customers).where(eq(s.customers.id, customerId)).limit(1);
  if (!row) throw new ApiError('UNAUTHENTICATED', 'Session expirée. Reconnectez-vous.');
  return toUserProfile(row);
}

const invalid = (message: string) => new ApiError('VALIDATION_ERROR', message, undefined, 422);

/**
 * Mise à jour du profil. Un type de client professionnel reste « en attente » :
 * le segment tarifaire ne change qu'après validation par AfriSime (back-office).
 */
export async function updateProfile(db: Db, customer: CustomerRow, body: ProfileUpdateBody): Promise<UserProfile> {
  const changes: Partial<typeof s.customers.$inferInsert> = {};

  if (body.firstName !== undefined) changes.firstName = body.firstName;
  if (body.lastName !== undefined) changes.lastName = body.lastName;
  if (body.email !== undefined) changes.email = body.email;

  if (body.agencyId !== undefined) {
    const [agency] = await db
      .select({ id: s.agencies.id })
      .from(s.agencies)
      .where(and(eq(s.agencies.id, body.agencyId), eq(s.agencies.isActive, true)));
    if (!agency) throw invalid('Agence inconnue.');
    changes.agencyId = agency.id;
  }

  let typeChanged = false;
  if (body.customerTypeId !== undefined && body.customerTypeId !== customer.customerTypeId) {
    const [type] = await db.select().from(s.customerTypes).where(eq(s.customerTypes.id, body.customerTypeId));
    if (!type || !type.isActive) throw invalid('Type de client inconnu.');
    typeChanged = true;
    changes.customerTypeId = type.id;
    changes.customerTypePending = type.requiresReview;
    // Un type sans validation applique tout de suite son segment ; sinon, le segment actuel est conservé.
    if (!type.requiresReview) changes.segment = type.segment;
  }

  if (body.consents?.marketing !== undefined) changes.marketingConsent = body.consents.marketing;
  if (body.consents?.termsVersion !== undefined) {
    const [terms] = await db.select().from(s.appSettings).where(eq(s.appSettings.key, 'legal.terms'));
    const current = (terms?.value as { version?: string } | undefined)?.version;
    if (body.consents.termsVersion !== current) throw invalid("Ces conditions d'utilisation ne sont plus en vigueur.");
    changes.termsVersion = current;
  }

  if (Object.keys(changes).length === 0) return toUserProfile(customer);

  const [updated] = await db
    .update(s.customers)
    .set({ ...changes, updatedAt: new Date() })
    .where(eq(s.customers.id, customer.id))
    .returning();
  if (typeChanged) {
    await db.insert(s.auditLog).values({
      actorType: 'customer',
      actorId: customer.id,
      action: 'customer.type_changed',
      entity: 'customer',
      entityId: customer.id,
      before: { customerTypeId: customer.customerTypeId, segment: customer.segment },
      after: { customerTypeId: updated!.customerTypeId, pending: updated!.customerTypePending, segment: updated!.segment },
    });
  }
  return toUserProfile(updated!);
}
