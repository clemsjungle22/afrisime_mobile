import { AdminCategory, AdminHome, AdminProductList, type AdminProductRow } from '@afrisime/shared';
import type { Metadata } from 'next';
import { z } from 'zod';
import { ImageUploader } from '@/components/image-uploader';
import { Alert, Card, CardHeader } from '@/components/ui/card';
import { requireAdmin } from '@/lib/admin';
import { api, mediaSrc } from '@/lib/api';
import { CATALOG_EDIT_ROLES, CATALOG_VIEW_ROLES } from '@/lib/catalog';
import { BannersManager } from './banners-manager';
import { SettingsForm } from './settings-form';

export const metadata: Metadata = { title: 'Accueil de l’app' };

/** Produits actifs (toutes les pages) pour choisir la destination d'une carte. */
async function activeProducts(): Promise<AdminProductRow[]> {
  const rows: AdminProductRow[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 20; page++) {
    const params = new URLSearchParams({ status: 'active' });
    if (cursor) params.set('cursor', cursor);
    const list: AdminProductList = await api(`/v1/admin/catalog/products?${params}`, {
      schema: AdminProductList,
    });
    rows.push(...list.items);
    cursor = list.nextCursor;
    if (!cursor) break;
  }
  return rows;
}

export default async function HomeAppPage() {
  const admin = await requireAdmin({ roles: CATALOG_VIEW_ROLES });
  const canEdit = CATALOG_EDIT_ROLES.includes(admin.role);
  const [home, categories, products] = await Promise.all([
    api('/v1/admin/home', { schema: AdminHome }),
    api('/v1/admin/catalog/categories', { schema: z.array(AdminCategory) }),
    activeProducts(),
  ]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">Accueil de l’app</h1>
        <p className="mt-1 text-sm text-muted">
          Cartes défilantes, textes et logo de l’écran d’accueil. Les changements apparaissent dans
          l’app en moins d’une minute.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Cartes défilantes"
          description="Dans l’ordre de défilement. Seules les cartes « En ligne » sont visibles dans l’app."
        />
        <div className="p-5">
          <BannersManager
            banners={home.banners}
            srcs={Object.fromEntries(home.banners.map((b) => [b.id, mediaSrc(b.imageUrl)]))}
            categories={categories
              .filter((c) => c.isActive)
              .map((c) => ({ slug: c.slug, name: c.name }))}
            products={products.map((p) => ({ slug: p.slug, name: `${p.name} · ${p.brand}` }))}
            canEdit={canEdit}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Textes et sections"
          description="Phrase sous « Bonjour », puis le petit texte, le titre et l’affichage de chaque section."
        />
        <div className="p-5">
          <SettingsForm appearance={home.appearance} canEdit={canEdit} />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Logo de l’en-tête"
          description="Affiché en haut de l’écran d’accueil de l’app."
        />
        <div className="flex flex-col gap-4 p-5">
          <ImageUploader
            target={{ kind: 'logo' }}
            src={mediaSrc(home.appearance.logoUrl)}
            fallback={{ src: '/logo.webp' }}
            canEdit={canEdit}
            shape="logo"
            removeMessage="Revenir au logo d’origine ? L’app affichera de nouveau le logo AfriSime intégré."
          />
          <Alert tone="info">
            L’icône de l’app sur le téléphone et l’écran de démarrage font partie de l’application
            elle-même : les changer demande de publier une nouvelle version sur le Play Store.
          </Alert>
        </div>
      </Card>
    </div>
  );
}
