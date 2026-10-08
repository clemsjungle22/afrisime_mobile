import type { AdminRole } from '@afrisime/shared';

export const CATALOG_VIEW_ROLES: readonly AdminRole[] = [
  'admin',
  'catalog',
  'orders',
  'support',
  'readonly',
];
export const CATALOG_EDIT_ROLES: readonly AdminRole[] = ['admin', 'catalog'];

/** « Huile végétale raffinée » → « HV » (vignette comme dans l'app). */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => w.length > 2 || /^[A-Z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

/** Valeur pour un champ datetime-local (heure de Lomé = UTC). */
export const toLocalInput = (d: Date) => d.toISOString().slice(0, 16);

/** Champ datetime-local (heure de Lomé = UTC) → ISO. */
export const fromLocalInput = (value: string) => new Date(`${value}:00.000Z`).toISOString();

export const ORIGIN_LABELS = { local: 'Local', imported: 'Importé' } as const;
