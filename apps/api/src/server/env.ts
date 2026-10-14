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
  /** Envoi des SMS : « console » = code affiché dans le terminal du serveur (développement uniquement). */
SMS_PROVIDER: z.enum(['console', 'disabled']).default('console'),
  /** Code OTP fixe pour les tests manuels (ex. 123456). Refusé en production. */
  OTP_DEV_CODE: z
    .string()
    .regex(/^\d{6}$/, 'OTP_DEV_CODE doit faire 6 chiffres')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  /** Prestataire de paiement. « simulated » : paiements simulés (développement uniquement). */
  /** Prestataire de paiement. « simulated » : paiements simulés (développement uniquement). */
PAYMENT_PROVIDER: z.enum(['simulated', 'disabled']).default('simulated'),
  /** Secret de signature des webhooks de paiement. Par défaut, dérivé d'AUTH_SECRET (développement). */
  PAYMENT_WEBHOOK_SECRET: z.string().min(32).optional().or(z.literal('').transform(() => undefined)),
  /** Développement : les commandes avancent seules (préparation, livraison…). Interdit en production. */
  ORDER_SIMULATION: z
    .enum(['true', 'false', ''])
    .default('false')
    .transform((v) => v === 'true'),
  /** Secret attendu par la route des tâches planifiées (absente = route désactivée). */
  CRON_SECRET: z.string().min(32).optional().or(z.literal('').transform(() => undefined)),
  /** Clé de chiffrement des secrets 2FA de l'équipe (≥ 32 caractères). Obligatoire en production. */
  ADMIN_ENCRYPTION_KEY: z.string().min(32).optional().or(z.literal('').transform(() => undefined)),
  /** Dossier des photos du catalogue (stockage sur disque, en développement). */
  MEDIA_DIR: z.string().min(1).default('.media'),
  /** Fichier JSON du compte de service Firebase (notifications push). Absent : pas de push. */
  FCM_SERVICE_ACCOUNT_FILE: z.string().optional().or(z.literal('').transform(() => undefined)),
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
  const d = parsed.data;
  if (d.NODE_ENV === 'production' && !d.ADMIN_ENCRYPTION_KEY) {
    throw new Error('Configuration invalide : ADMIN_ENCRYPTION_KEY est obligatoire en production.');
  }
  if (
    d.NODE_ENV === 'production' &&
    (d.OTP_DEV_CODE || d.SMS_PROVIDER === 'console' || d.PAYMENT_PROVIDER === 'simulated' || d.ORDER_SIMULATION)
  ) {
    throw new Error(
      'Configuration invalide : OTP_DEV_CODE, SMS_PROVIDER=console, PAYMENT_PROVIDER=simulated et ORDER_SIMULATION sont interdits en production.',
    );
  }
  cached = parsed.data;
  return cached;
}
