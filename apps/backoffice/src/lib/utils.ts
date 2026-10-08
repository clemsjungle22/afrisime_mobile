import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Fusionne des classes Tailwind (la dernière l'emporte en cas de conflit). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const fcfa = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

/** 43500 → « 43 500 F » */
export const formatFCFA = (amount: number) => `${fcfa.format(amount)} F`;

/** Date et heure de Lomé (UTC+0). */
export const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lome' }).format(new Date(iso));

export const formatDay = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Lome' }).format(new Date(iso));

/** Libellés des statuts de commande (back-office). */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending_payment: 'En attente de paiement',
  payment_failed: 'Paiement échoué',
  confirmed: 'À préparer',
  preparing: 'En préparation',
  ready_for_pickup: 'Prête au retrait',
  out_for_delivery: 'En livraison',
  delivered: 'Livrée',
  completed: 'Retirée',
  cancelled: 'Annulée',
  refunded: 'Remboursée',
};
