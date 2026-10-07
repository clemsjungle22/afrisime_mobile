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
});
export type Env = z.infer<typeof Env>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = Env.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `- ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Configuration invalide :\n${lines.join('\n')}`);
  }
  cached = parsed.data;
  return cached;
}
