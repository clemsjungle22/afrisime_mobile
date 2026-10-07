# apps/api — Backend AfriSime

Unique point d'entrée de l'app mobile et du back-office. L'app ne parle **jamais** directement à la base ni à AfriGes.

## Stack

- **Next.js 16** (routes API uniquement, pas de pages) + TypeScript strict
- **PostgreSQL** hébergé chez **Supabase**, via **Drizzle ORM** et le pilote `postgres`
- **PGlite** (PostgreSQL en mémoire) pour les tests : mêmes migrations, aucune base à installer
- Contrat : schémas zod de `@afrisime/shared` ; données d'exemple : `@afrisime/fixtures`

## Démarrer

1. Dans Supabase : **Connect → Transaction pooler** (port 6543), copier la chaîne.
2. La coller dans `apps/api/.env.local` sur la ligne `DATABASE_URL=` (remplacer `[YOUR-PASSWORD]`).
   Ce fichier est ignoré par git : il ne doit jamais être commité ni partagé.
3. Depuis la racine du dépôt :

```bash
npm run db:migrate   # crée les tables (rejouable)
npm run db:seed      # charge les données d'exemple (rejouable, sans doublon)
npm run api          # http://localhost:4000
```

Vérifier : `http://localhost:4000/health` → `{ "status": "ok", "database": "ok" }`.
Contrat de l'API : `http://localhost:4000/v1/openapi.json`.

## Commandes

| Commande (dans apps/api)                | Rôle                                                   |
| --------------------------------------- | ------------------------------------------------------ |
| `npm run dev`                           | serveur de développement (accessible sur le réseau local) |
| `npm test`                              | tests sur PGlite (aucune connexion à Supabase)         |
| `npm run db:generate -- --name <nom>`   | nouvelle migration SQL après une modification du schéma |
| `npm run db:migrate` / `npm run db:seed`| appliquer les migrations / charger les données d'exemple |

## Organisation

```
src/app/                 routes HTTP (health, v1/…)
src/server/db/schema.ts  schéma de la base (source des migrations)
src/server/db/seed.ts    données d'exemple
src/server/http/         enveloppe de route (validation zod, erreurs, request-id), OpenAPI
src/server/env.ts        configuration validée au démarrage
src/server/log.ts        journaux JSON, secrets et téléphones masqués
drizzle/                 migrations SQL versionnées
```

## Règles

- **Le serveur décide** : prix, stock, remises, confirmation de paiement.
- Montants en **FCFA entiers**. Erreurs au format unique `{ error: { code, message, requestId } }`.
- `Idempotency-Key` obligatoire sur les créations et paiements.
- **Supabase = PostgreSQL, rien de plus** : pas de Supabase Auth, pas de RLS, pas d'Edge Functions,
  pas d'accès direct depuis les clients. Changer d'hébergeur = changer `DATABASE_URL`.
- Intégration AfriGes plus tard via la table `outbox` (événements métier) et le contrat OpenAPI.
- Aucun secret côté app : clés des prestataires de paiement, SMS et AfriGes restent ici.
