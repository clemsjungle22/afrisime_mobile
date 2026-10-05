# apps/api — Backend AfriSime

> Dossier réservé. Le backend n'est pas encore initialisé.

Rôle : unique point d'entrée de l'app mobile et du back-office. L'app ne parle **jamais** directement à AfriGes (ERP).

## Stack recommandée (à confirmer)

- Node.js LTS + TypeScript strict, NestJS (ou Fastify modulaire)
- PostgreSQL (Prisma ou Drizzle), Redis + BullMQ, stockage compatible S3
- Contrat d'API : schémas zod de `@afrisime/shared` (REST JSON, préfixe `/v1`)

## Principes

- Le serveur décide : prix, stock, remises, crédit, confirmation de paiement, points de fidélité.
- `Idempotency-Key` obligatoire sur les créations et paiements.
- Webhooks PSP vérifiés et idempotents, réconciliation périodique.
- Intégration AfriGes via outbox ; mapping à définir en phase 0.
- Aucun secret côté app : clés PSP, AfriGes et OTP restent ici.

En attendant, l'app mobile tourne sur des mocks typés (`EXPO_PUBLIC_API_MOCK=true`).
