import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui';
import { formatCountdown } from '@/lib/dates';

/** Compte à rebours jusqu'à `endsAt` (ISO). Masqué une fois l'offre terminée. */
export function FlashCountdown({ endsAt }: { endsAt: string }) {
  const end = Date.parse(endsAt);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (Number.isNaN(end) || end <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [end]);

  const remaining = end - now;
  if (Number.isNaN(end) || remaining <= 0) return null;
  return <Badge label={`Se termine dans ${formatCountdown(remaining)}`} tone="error" />;
}
