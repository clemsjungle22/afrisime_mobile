import './load-env';
import { parseArgs } from 'node:util';
import { AdminRole } from '@afrisime/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { adminAudit } from '../src/server/admin/auth';
import { hashPassword, temporaryPassword } from '../src/server/admin/crypto';
import { createPostgresDb } from '../src/server/db/client';
import * as s from '../src/server/db/schema';
import { env } from '../src/server/env';
import { newId } from '../src/server/ids';

/**
 * Crée un compte de l'équipe avec un mot de passe provisoire (affiché UNE fois, à changer à la connexion).
 *
 *   npm run admin:create -- --email awa@afrisime.tg --name "Awa Mensah" [--role admin]
 *   npm run admin:create -- --email awa@afrisime.tg --reset   (mot de passe oublié / compte bloqué)
 *
 * --reset : nouveau mot de passe provisoire, compte débloqué, sessions fermées, 2FA à réactiver.
 */
const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    role: { type: 'string', default: 'admin' },
    reset: { type: 'boolean', default: false },
  },
});

async function main() {
  const email = z.string().trim().toLowerCase().email('E-mail invalide (--email)').parse(values.email);
  const role = AdminRole.parse(values.role);
  const { db, close } = createPostgresDb(env().DATABASE_URL, { max: 1 });
  try {
    const [existing] = await db.select().from(s.adminUsers).where(eq(s.adminUsers.email, email));
    const password = temporaryPassword();
    const passwordHash = await hashPassword(password);
    const now = new Date();

    if (values.reset) {
      if (!existing) throw new Error(`Aucun compte pour ${email}.`);
      await db
        .update(s.adminUsers)
        .set({ passwordHash, mustChangePassword: true, totpSecret: null, totpLastStep: null, failedAttempts: 0, lockedUntil: null, updatedAt: now })
        .where(eq(s.adminUsers.id, existing.id));
      await db.update(s.adminSessions).set({ revokedAt: now }).where(eq(s.adminSessions.adminId, existing.id));
      await adminAudit(db, { actorId: null, action: 'admin.reset_by_cli', entityId: existing.id });
      console.log(`\n✔ Compte réinitialisé : ${existing.name} <${email}>`);
    } else {
      if (existing) throw new Error(`Un compte existe déjà pour ${email} (utilisez --reset).`);
      const name = z.string().trim().min(2, 'Nom requis (--name)').parse(values.name);
      const id = newId('adm');
      await db.insert(s.adminUsers).values({ id, email, name, role, passwordHash, mustChangePassword: true });
      await adminAudit(db, { actorId: null, action: 'admin.created_by_cli', entityId: id, after: { email, name, role } });
      console.log(`\n✔ Compte créé : ${name} <${email}> — rôle ${role}`);
    }
    console.log(`\n  Mot de passe provisoire : ${password}\n`);
    console.log('  Il ne sera plus affiché. À changer à la première connexion sur le back-office.');
    if (role === 'admin' || existing?.role === 'admin') {
      console.log("  Le code de vérification (2FA) sera activé à la connexion : gardez une application d'authentification à portée.");
    }
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error(`\n✘ ${error instanceof z.ZodError ? error.issues.map((i) => i.message).join(', ') : error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
