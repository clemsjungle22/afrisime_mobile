import {
  AdminAgency,
  AdminCustomerType,
  AdminDeliverySettings,
  AdminSlotSettings,
  AdminTeamMember,
} from '@afrisime/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';
import { requireAdmin } from '@/lib/admin';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { AgenciesSettings } from './agencies-settings';
import { DeliverySettings } from './delivery-settings';
import { SlotsSettings } from './slots-settings';
import { TeamSettings } from './team-settings';
import { TypesSettings } from './types-settings';

export const metadata: Metadata = { title: 'Paramètres' };

const TABS = {
  livraison: 'Livraison',
  creneaux: 'Créneaux',
  agences: 'Agences',
  profils: 'Profils clients',
  equipe: 'Équipe',
} as const;
type Tab = keyof typeof TABS;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ onglet?: string }>;
}) {
  await requireAdmin({ roles: ['admin'] });
  const { onglet } = await searchParams;
  const tab: Tab = onglet && onglet in TABS ? (onglet as Tab) : 'livraison';

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">Paramètres</h1>
        <p className="mt-1 text-sm text-muted">
          Réglages commerciaux appliqués dans l’app sans nouvelle version. Chaque modification est
          tracée.
        </p>
      </div>
      <nav aria-label="Rubriques" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {(Object.entries(TABS) as [Tab, string][]).map(([key, label]) => (
          <Link
            key={key}
            href={`/parametres?onglet=${key}`}
            aria-current={tab === key ? 'page' : undefined}
            className={cn(
              'shrink-0 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors',
              tab === key
                ? 'bg-brand-900 text-white'
                : 'bg-white text-muted ring-1 ring-line hover:text-ink',
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
      <TabContent tab={tab} />
    </div>
  );
}

async function TabContent({ tab }: { tab: Tab }) {
  switch (tab) {
    case 'livraison':
      return (
        <DeliverySettings
          settings={await api('/v1/admin/settings/delivery', { schema: AdminDeliverySettings })}
        />
      );
    case 'creneaux':
      return (
        <SlotsSettings
          config={await api('/v1/admin/settings/slots', { schema: AdminSlotSettings })}
        />
      );
    case 'agences':
      return (
        <AgenciesSettings
          agencies={await api('/v1/admin/settings/agencies', { schema: z.array(AdminAgency) })}
        />
      );
    case 'profils':
      return (
        <TypesSettings
          types={await api('/v1/admin/settings/customer-types', {
            schema: z.array(AdminCustomerType),
          })}
        />
      );
    case 'equipe':
      return (
        <TeamSettings team={await api('/v1/admin/team', { schema: z.array(AdminTeamMember) })} />
      );
  }
}
