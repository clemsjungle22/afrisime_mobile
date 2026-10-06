import type { Availability } from '@afrisime/shared';
import { Badge } from '@/components/ui';
import { presentAvailability } from '../availability';

type Props = {
  availability: Availability;
  leadTimeDays?: number | null;
  /** Masque « Disponible » (cas nominal) pour alléger les cartes. */
  hideWhenAvailable?: boolean;
};

export function AvailabilityTag({ availability, leadTimeDays = null, hideWhenAvailable = false }: Props) {
  if (hideWhenAvailable && availability === 'available') return null;
  const p = presentAvailability(availability, leadTimeDays);
  return <Badge label={p.label} tone={p.tone} />;
}
