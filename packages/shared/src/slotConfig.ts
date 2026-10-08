import { z } from 'zod';

/**
 * Créneaux proposés au checkout, réglables dans le back-office (RB-010).
 * Heures entières en heure de Lomé (UTC+0). Jours : 0 = dimanche … 6 = samedi.
 */

export const SlotWindow = z
  .object({
    from: z.number().int().min(0).max(23),
    to: z.number().int().min(1).max(24),
  })
  .refine((w) => w.to > w.from, { message: 'La fin doit être après le début', path: ['to'] });
export type SlotWindow = z.infer<typeof SlotWindow>;

const Windows = z
  .array(SlotWindow)
  .min(1, 'Au moins une plage horaire')
  .max(8)
  .refine((ws) => ws.every((w, i) => i === 0 || w.from >= ws[i - 1]!.to), {
    message: 'Les plages doivent se suivre sans se chevaucher',
  });

/** Nombre maximum de commandes par créneau (null : sans limite). */
const Capacity = z.number().int().min(1).max(10_000).nullable();

export const SlotConfig = z.object({
  delivery: Windows,
  pickup: Windows,
  /** Jours sans créneau (fermeture). */
  closedDays: z
    .array(z.number().int().min(0).max(6))
    .max(6, 'Au moins un jour doit rester ouvert')
    .refine((d) => new Set(d).size === d.length, { message: 'Jour en double' }),
  /** Nombre de jours ouverts proposés. */
  daysAhead: z.number().int().min(1).max(14),
  capacity: z.object({ delivery: Capacity, pickup: Capacity }),
});
export type SlotConfig = z.infer<typeof SlotConfig>;

export const DEFAULT_SLOT_CONFIG: SlotConfig = {
  delivery: [
    { from: 8, to: 12 },
    { from: 12, to: 16 },
    { from: 16, to: 20 },
  ],
  pickup: [
    { from: 8, to: 12 },
    { from: 12, to: 16 },
    { from: 16, to: 19 },
  ],
  closedDays: [0],
  daysAhead: 3,
  capacity: { delivery: null, pickup: null },
};

export const WEEKDAY_LABELS = [
  'Dimanche',
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
] as const;
