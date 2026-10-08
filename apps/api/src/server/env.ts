import { z } from 'zod';

/**
 * Configuration validée au démarrage : une variable manquante ou invalide arrête le serveur
 * avec un message clair plutôt qu'une erreur obscure à la première requête.
 */
const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL manquante : collez la chaîne « Transaction pooler » de Supabase dans apps/api/.env.local')
    .refine((v) => v.startsWith('postgres://') || v.startsWith('postgresql://'), 'DATABASE_URL doit commencer par postgresql://'),
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET doit faire au moins 32 caractères'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  /** Envoi des SMS : « console » = code affiché dans le terminal du serveur (développement uniquement). */
  SMS_PROVIDER: z.enum(['console']).default('console'),
  /** Code OTP fixe pour les tests manuels (ex. 123456). Refusé en production. */
  OTP_DEV_CODE: z
    .string()
    .regex(/^\d{6}$/, 'OTP_DEV_CODE doit faire 6 chiffres')
    .optional()
    .or(z.literal('').transform(() => undefined)),
});
export type Env = z.infer<typeof Env>;

let cached: Env | null = null;

/** Tests : relit process.env au prochain appel. */
export function resetEnvCache() {
  cached = null;
}

export function env(): Env {
  if (cached) return cached;
  const parsed = Env.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `- ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Configuration invalide :\n${lines.join('\n')}`);
  }
  if (parsed.data.NODE_ENV === 'production' && (parsed.data.OTP_DEV_CODE || parsed.data.SMS_PROVIDER === 'console')) {
    throw new Error('Configuration invalide : OTP_DEV_CODE et SMS_PROVIDER=console sont interdits en production.');
  }
  cached = parsed.data;
  return cached;
}
