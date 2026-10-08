import type {
  AdminOrderAction,
  OrderStatus,
  PaymentMethodId,
  PaymentStatus,
} from '@afrisime/shared';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

/** Couleur d'une étape : ce qui attend l'équipe ressort (orange), ce qui est fini est discret. */
export const STATUS_TONES: Record<OrderStatus, Tone> = {
  pending_payment: 'info',
  payment_failed: 'danger',
  confirmed: 'accent',
  preparing: 'warning',
  ready_for_pickup: 'success',
  out_for_delivery: 'success',
  delivered: 'neutral',
  completed: 'neutral',
  cancelled: 'danger',
  refunded: 'danger',
};

export const PAYMENT_SHORT: Record<PaymentMethodId, string> = {
  mixx: 'Mixx by Yas',
  flooz: 'Flooz',
  card: 'Carte',
  cash_on_delivery: 'À la livraison',
  pay_at_agency: 'En agence',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, { label: string; tone: Tone }> = {
  initiated: { label: 'À payer', tone: 'info' },
  pending: { label: 'En attente', tone: 'info' },
  succeeded: { label: 'Payé', tone: 'success' },
  failed: { label: 'Échoué', tone: 'danger' },
  expired: { label: 'Expiré', tone: 'danger' },
  refunded: { label: 'Remboursé', tone: 'danger' },
};

/** Libellé des boutons d'action et texte de confirmation. */
export const ACTION_COPY: Record<
  Exclude<AdminOrderAction, 'add_note'>,
  { label: string; title: string; description: string }
> = {
  start_preparing: {
    label: 'Passer en préparation',
    title: 'Commencer la préparation ?',
    description:
      'Le client verra « Votre commande est en préparation ». Elle ne pourra plus être annulée par le client.',
  },
  mark_ready: {
    label: 'Prête au retrait',
    title: 'Commande prête au retrait ?',
    description: 'Le client sera informé qu’il peut venir la retirer avec son code.',
  },
  dispatch: {
    label: 'Remettre au livreur',
    title: 'Remettre la commande au livreur ?',
    description:
      'Le client verra « Le livreur est en route ». Ajoutez si besoin le nom et le numéro du livreur.',
  },
  delivery_failed: {
    label: 'Échec de livraison',
    title: 'Signaler un échec de livraison',
    description: 'La commande revient « En préparation ». Le motif est visible par le client.',
  },
  mark_delivered: {
    label: 'Marquer livrée',
    title: 'Commande livrée ?',
    description: 'La commande est clôturée et le stock définitivement déduit.',
  },
  complete_pickup: {
    label: 'Remettre au client',
    title: 'Remettre la commande au client',
    description:
      'Saisissez le code à 6 chiffres présenté par le client. Sans le bon code, ne remettez pas la commande.',
  },
  collect_payment: {
    label: 'Encaisser',
    title: 'Encaisser le paiement',
    description: 'Confirmez le montant reçu en espèces (livreur ou agence).',
  },
  cancel: {
    label: 'Annuler la commande',
    title: 'Annuler la commande ?',
    description:
      'Le stock réservé est libéré. Si la commande est déjà payée, elle est remboursée. Le motif est visible par le client.',
  },
};

/** Ordre d'affichage : l'étape suivante d'abord, puis l'encaissement, puis les actions exceptionnelles. */
export const ACTION_ORDER: AdminOrderAction[] = [
  'start_preparing',
  'mark_ready',
  'dispatch',
  'collect_payment',
  'mark_delivered',
  'complete_pickup',
  'delivery_failed',
  'cancel',
];

/** Créneau lisible : « Aujourd'hui · 8 h – 12 h », « Demain · … », sinon la date. */
export function formatSlot(
  slot: { start: string; end: string },
  now = new Date(),
): { label: string; today: boolean } {
  const start = new Date(slot.start);
  const end = new Date(slot.end);
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const tomorrow = new Date(now.getTime() + 86_400_000);
  const hours = `${start.getUTCHours()} h – ${end.getUTCHours()} h`;
  if (dayKey(start) === dayKey(now)) return { label: `Aujourd’hui · ${hours}`, today: true };
  if (dayKey(start) === dayKey(tomorrow)) return { label: `Demain · ${hours}`, today: false };
  const day = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Africa/Lome',
  }).format(start);
  return { label: `${day} · ${hours}`, today: false };
}

/** +22890112233 → 90 11 22 33 */
export const formatPhone = (e164: string) =>
  e164
    .replace(/^\+228/, '')
    .replace(/(\d{2})(?=\d)/g, '$1 ')
    .trim();
