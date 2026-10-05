# apps/backoffice — Back-office AfriSime

> Dossier réservé. Le back-office n'est pas encore initialisé.

Application **web** séparée (aucun écran d'administration dans l'app mobile).

## Stack recommandée (à confirmer)

- Next.js + TypeScript strict
- Consomme la même API que le mobile, routes `/v1/admin/*`
- Schémas partagés : `@afrisime/shared`

## Périmètre

Catalogue, prix, stock, commandes, paiements et remboursements, livraison, crédit, carnets, fidélité, promotions, support, paramétrage (zones, frais, créneaux, segments) et journal d'audit.
RBAC fin (admin, catalogue, commandes, crédit, livraison, marketing, support, lecture seule…), sessions admin distinctes des sessions clients.
