import {
  type AdminKyc,
  KYC_DOC_LABELS,
  KYC_PHOTO_LABELS,
  KYC_STATUS_LABELS,
} from '@afrisime/shared';
import { Badge, Card, CardHeader } from '@/components/ui/card';
import { mediaSrc } from '@/lib/api';
import { formatDateTime, formatFCFA } from '@/lib/utils';

const TONES = {
  none: 'neutral',
  pending: 'accent',
  verified: 'success',
  rejected: 'danger',
} as const;

/** Vérification d'identité : achats sur 30 jours, pièce et photos (adresses signées, quelques minutes). */
export function KycCard({ kyc }: { kyc: AdminKyc }) {
  const over = kyc.threshold > 0 && kyc.spent30d > kyc.threshold;
  return (
    <Card>
      <CardHeader
        title="Vérification d’identité"
        description={
          kyc.threshold > 0
            ? `Exigée au-delà de ${formatFCFA(kyc.threshold)} d’achats sur 30 jours.`
            : 'Contrôle désactivé (seuil à 0 dans Paramètres).'
        }
      />
      <div className="flex flex-col gap-4 px-5 py-4 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={TONES[kyc.status]}>{KYC_STATUS_LABELS[kyc.status]}</Badge>
          <span className={over ? 'font-semibold text-warning' : 'text-muted'}>
            Achats sur 30 jours : {formatFCFA(kyc.spent30d)}
          </span>
        </div>
        {kyc.docType ? (
          <p className="text-ink">
            {KYC_DOC_LABELS[kyc.docType]} n° <strong>{kyc.docNumber}</strong>
            {kyc.submittedAt ? (
              <span className="text-muted"> · envoyée le {formatDateTime(kyc.submittedAt)}</span>
            ) : null}
          </p>
        ) : (
          <p className="text-muted">Aucun dossier envoyé.</p>
        )}
        {kyc.reviewedAt ? (
          <p className="text-muted">
            {kyc.status === 'verified' ? 'Validée' : 'Refusée'} le {formatDateTime(kyc.reviewedAt)}
            {kyc.reviewedBy ? ` par ${kyc.reviewedBy}` : ''}
            {kyc.reason ? ` : « ${kyc.reason} »` : ''}
          </p>
        ) : null}
        {kyc.photos.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {kyc.photos.map((p) => (
              <a
                key={p.kind}
                href={mediaSrc(p.url) ?? '#'}
                target="_blank"
                rel="noreferrer"
                className="group flex flex-col gap-1.5"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- photo privée servie par l'API (adresse signée) */}
                <img
                  src={mediaSrc(p.url) ?? ''}
                  alt={KYC_PHOTO_LABELS[p.kind]}
                  className="aspect-[4/3] w-full rounded-xl border border-line bg-canvas object-contain group-hover:border-brand-600"
                />
                <span className="text-xs font-semibold text-muted">{KYC_PHOTO_LABELS[p.kind]}</span>
              </a>
            ))}
          </div>
        ) : null}
        {kyc.photos.length > 0 ? (
          <p className="text-xs text-muted">
            Photos visibles 10 minutes : rechargez la page si elles ne s’affichent plus.
          </p>
        ) : null}
      </div>
    </Card>
  );
}
