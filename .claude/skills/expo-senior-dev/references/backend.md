# Backend et back-office AfriSime — architecture de référence

Le backend est **nouveau**. Les choix ci-dessous sont la recommandation par défaut. S'ils ont été changés dans le dépôt (vérifie `apps/api/package.json` et le README), suis l'existant.

## Stack recommandée

| Composant | Choix | Raison |
|---|---|---|
| Runtime | Node.js LTS + TypeScript strict | Même langage que l'app, schémas zod partagés |
| Framework | NestJS (ou Fastify modulaire) | Modules par domaine, injection de dépendances, guards RBAC |
| Base | PostgreSQL | Transactionnel, exigé par le cahier |
| ORM | Prisma ou Drizzle | Migrations versionnées, typage |
| Cache / files | Redis + BullMQ | Rate limit OTP, réservations de stock, jobs asynchrones |
| Stockage objet | Compatible S3 | Médias produits, pièces crédit, preuves de livraison, reçus PDF |
| Back-office | Next.js (`apps/backoffice`) | Web, RBAC, consomme la même API (`/v1/admin/*`) |
| Observabilité | Logs structurés, métriques, traces (OpenTelemetry), Sentry | Exigé section 10 |

## Modules

`auth` (OTP, sessions, appareils) · `customers` (profil, segments, agences, consentements) · `catalog` · `pricing` · `inventory` · `cart` · `checkout` · `orders` · `payments` · `delivery` · `credit` · `carnets` · `loyalty` · `promotions` · `support` · `notifications` · `afriges` (intégration) · `audit` · `admin` (RBAC).

## Principes non négociables

1. **Prix et totaux calculés uniquement côté serveur.** `checkout/quote` produit un devis signé, avec expiration ; `POST /orders` n'accepte qu'un `quoteId` valide.
2. **Réservation de stock** à la création de la commande, avec TTL pour `pending_payment` ; libérée à l'expiration ou à l'annulation.
3. **Paiements** : table `payments` avec contrainte d'unicité sur `(provider, providerReference)` ; webhooks PSP avec **vérification de signature**, traités de façon idempotente ; la confirmation de commande se fait dans la même transaction que l'enregistrement du paiement réussi. Job de **réconciliation** périodique (paiements `pending` interrogés chez le PSP). Architecture multi-provider : interface `PaymentProvider` (`createIntent`, `getStatus`, `refund`, `parseWebhook`) avec un adaptateur par PSP.
4. **Idempotence** : table `idempotency_keys (key, userId, route, requestHash, response, createdAt)` ; middleware appliqué aux routes listées dans le contrat d'API.
5. **Intégration AfriGes via outbox** : chaque événement métier (commande créée, payée, annulée, remboursement, versement crédit) est écrit dans une table `outbox` dans la même transaction, puis poussé vers AfriGes par un worker avec retries et traçabilité. Les données de référence (produits, prix, stock, clients, crédit) sont synchronisées depuis AfriGes (pull planifié ou webhooks selon ce qu'AfriGes expose — **mapping à définir en phase 0**). AfriGes reste la source de vérité pour les données opérationnelles qu'il couvre déjà.
6. **Crédit** : décision d'éligibilité et de disponible validée avec AfriGes au moment de la commande ; jamais sur la seule base du cache.
7. **Audit (RB-005)** : table `audit_log` en ajout seul (qui, quoi, avant/après, quand, IP) pour prix, stock, crédit, remboursements, annulations, rôles.
8. **OTP** : code à 6 chiffres, haché en base, expiration courte, tentatives limitées par numéro et par IP, renvoi temporisé. Fournisseur SMS derrière une interface.
9. **RBAC back-office** : rôles (admin, catalogue, commandes, crédit, livraison, marketing, support, lecture seule…) et permissions fines ; sessions admin distinctes des sessions clients.
10. **Paramétrage sans redéploiement (RB-010)** : zones, frais, créneaux, segments, plafonds par défaut, règles de fidélité, packs, bannières et promotions sont des données administrables.

## Modèle de données (entités clés)

Client (ID, identité, téléphone, email, segment, agence, adresses, consentements, statut) · Agence · Segment · Produit (SKU, code-barres, nom, catégorie, marque, unité, conditionnement, médias) · Variante · Prix (SKU, segment, agence, prix, validité, conditions) · Stock (SKU, agence, disponible, réservé, seuil, horodatage) · Panier · Devis · Commande + lignes + historique des statuts · Paiement (ID, commande, provider, référence, montant, statut) · Remboursement (ID, montant, canal, référence, statut) · Livraison (adresse, zone, créneau, livreur, statut, preuve) · Zone · Créneau · Livreur · Crédit (client, plafond, disponible, encours, échéances, statut) · Demande de crédit · Échéance · Carnet / offre / versement · Fidélité (points, mouvements, coupons, campagnes) · Promotion · Coupon · Ticket + messages · Notification · Consentement · AuditLog · Outbox · IdempotencyKey.

## Back-office — modules

Dashboard (CA, commandes, panier moyen, clients actifs, stock critique, crédit, livraison) · Catalogue (produits, catégories, marques, médias, unités) · Prix (détail/B2B, agence, segment, historique) · Stock (disponible, réservé, seuils, ruptures, substitutions, mouvements) · Commandes (recherche, préparation, annulation, remboursement, statuts) · CRM (clients, segments, historique, consentements) · Crédit (dossiers, plafonds, échéanciers, retards, remboursements) · Livraison (zones, frais, créneaux, livreurs, preuves) · Marketing (campagnes, coupons, push, bannières, segmentation) · Support (tickets, SLA, affectation) · Sécurité (rôles, permissions, sessions, audit) · Réconciliation des paiements.

## Tests et qualité

- Tests unitaires sur pricing, promotions, machine à états de commande, crédit.
- Tests d'intégration sur PostgreSQL réel (conteneur) pour les flux commande → paiement → webhook → confirmation.
- Scénarios obligatoires : rupture pendant le checkout, double paiement (même clé, clés différentes, webhook rejoué), paiement échoué/expiré, remboursement, crédit insuffisant, livraison échouée.
- Revue OWASP API Top 10 avant production.
