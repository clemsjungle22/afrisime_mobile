# Domaine métier AfriSime Virtual Market

Synthèse du cahier des charges fonctionnel et technique et du catalogue du site existant. Les éléments marqués **[à confirmer]** sont des interprétations : implémente-les de façon paramétrable et signale-les dans ta réponse.

## Sommaire
1. Principe et parcours
2. Profils clients et segments
3. Catalogue, prix, stock
4. Panier et checkout
5. Commande — machine à états
6. Paiement
7. Livraison et retrait
8. Crédit commercial
9. Carnets et packs
10. Fidélité, parrainage, promotions
11. Support
12. Règles métier RB-xxx
13. Backlog et roadmap
14. Inventaire des écrans mobiles

---

## 1. Principe et parcours

« Voir → choisir → commander → payer ou utiliser son crédit → recevoir → suivre → fidéliser. »

Parcours de commande et contrôles associés :

| Étape | Contrôle |
|---|---|
| Panier | Revalidation stock/prix par le serveur |
| Checkout | Adresse, mode de réception, créneau, conditions |
| Paiement | Transaction unique et réconciliée |
| Commande | ID unique + statut |
| Préparation | Picking + contrôle des quantités (back-office) |
| Expédition | Affectation livreur + suivi |
| Livraison | OTP ou preuve si activé |
| Clôture | Reçu/facture + attribution fidélité |

Règle critique (section 5, partiellement tronquée dans le PDF) : une commande ne doit jamais être confirmée uniquement à partir d'une information côté client. **[à confirmer : formulation exacte]** La confirmation vient du backend, après validation du paiement (webhook/réconciliation) ou de l'éligibilité crédit.

## 2. Profils clients et segments

| Profil | Fonctions principales |
|---|---|
| Visiteur | Catalogue, recherche, promotions, agences, inscription |
| Particulier / Famille | Panier, paiement, livraison, packs, favoris, réachat |
| Revendeur / Commerçant | Tarifs B2B, gros, commandes répétitives, crédit si éligible |
| Restaurant / PME | Volumes, factures, listes récurrentes, créneaux |
| Client à crédit | Plafond, commande à crédit, échéancier, remboursement |
| Administrateur | Back-office web uniquement |

Le **segment** et l'**agence** de rattachement d'un client déterminent ses prix, son stock visible, ses promotions et son accès au crédit. Le visiteur non connecté voit les prix détail de l'agence par défaut.

## 3. Catalogue, prix, stock

**Rayons actuels (site)** : Épicerie, Boissons, Céréales & farines, Huiles, Produits locaux, Hygiène & entretien. La liste vient de l'API, ne la code pas en dur.

**Produit** : SKU, code-barres, nom, slug, catégorie/sous-catégorie, marque, origine (local / importé), description, médias, produits associés, badges (Populaire, Promotion, Nouveau, B2B, Rupture, Sur commande).

**Conditionnements (variantes)** : un produit a plusieurs conditionnements avec chacun son prix et son stock. Exemples : sachet, paquet, bouteille, canette, boîte, pot, barre, sac, bidon, carton, fardeau, pack. Le site affiche une fourchette « à partir de – jusqu'à ». Exemple : riz parfumé « sac 5 kg » ou formats supérieurs, huile en bouteille 1 L ou bidon 25 L.

**Prix** : fonction de (SKU/conditionnement, segment, agence, période de validité, conditions). Prix détail et prix B2B/gros. Prix barré + pourcentage de remise si promotion. Tous les montants sont des **entiers en FCFA**.

**Disponibilité** : 4 états, chacun avec un rendu et une action distincts.

| État | Affichage | Action |
|---|---|---|
| `available` | Disponible | Ajouter au panier |
| `on_order` | Sur commande (délai) | Ajouter avec mention du délai |
| `unavailable` | Temporairement indisponible | Pas d'ajout ; « M'alerter » / substitution |
| `quote_only` | Prix sur devis | « Demander un devis » (formulaire B2B) |

**Stock** : par SKU et par agence (disponible, réservé, seuil, horodatage). L'app n'affiche qu'un état et éventuellement « plus que N » ; la quantité exacte reste côté serveur.

**Recherche** : plein texte, suggestions, correction orthographique. Filtres : catégorie, prix min/max, marque, disponibilité, conditionnement, origine, offres (promotion, nouveautés, formats pro). Tris : pertinence, populaires, nouveautés, prix croissant/décroissant. Journalise les recherches sans résultat (KPI).

## 4. Panier et checkout

**Panier** : lignes (produit + conditionnement + quantité), suppression, coupon, remises, frais, total. Le panier est conservé localement (hors-ligne) et synchronisé avec le serveur quand l'utilisateur est connecté.

**Revalidation (RB-002)** : avant le checkout et avant le paiement, le serveur recalcule prix, stock, remises et frais. Si quelque chose a changé, l'app affiche « Votre panier a changé » avec le détail (prix modifié, quantité réduite, produit indisponible) et demande confirmation. Le total affiché au paiement est toujours celui du serveur.

**Checkout** :
- Mode de réception : livraison ou retrait en agence.
- Adresse (multiples, avec repère / instructions, géolocalisation optionnelle), zone, créneau, instructions.
- Paiement : Mobile Money (au Togo, principalement Mixx by Yas et Flooz, via un PSP), carte si disponible, paiement en agence, paiement à la livraison si autorisé pour le client/zone.
- « Utiliser mon crédit » visible uniquement si le client est éligible, avec simulation (disponible avant/après, échéances).

## 5. Commande — machine à états

Statuts proposés **[à confirmer avec AfriSime, mapping AfriGes à faire]** :

```
pending_payment ──► confirmed ──► preparing ──► ready_for_pickup ──► completed
      │                │              │                └► (retrait)
      │                │              └──► out_for_delivery ──► delivered ──► completed
      │                │                          └──► delivery_failed ──► (replanifiée | cancelled)
      ├──► payment_failed / expired ──► (nouvel essai | cancelled)
      └──► cancelled
confirmed / preparing ──► cancelled ──► refunded (si payée)
delivered ──► partially_delivered (livraison partielle / substitution)
```

- Numéro de commande unique lisible (ex. `AFS-2026-000123`) + ID technique.
- Annulation possible selon le statut (RB-009) : en pratique, jusqu'à `confirmed` ou `preparing` selon paramétrage.
- Détail : lignes, substitutions, remises, frais, paiement, livraison, historique des statuts, reçu/facture (PDF).
- « Commander à nouveau » : recrée un panier à partir d'une commande passée, avec revalidation.
- Commande à crédit : statut `confirmed` uniquement après validation serveur de l'éligibilité et du disponible (RB-004).

## 6. Paiement

- Architecture multi-provider ; l'app ne connaît qu'un `paymentIntent` générique renvoyé par le backend (méthode, instructions, URL de redirection ou code USSD à valider sur le téléphone).
- Statuts : `initiated`, `pending`, `succeeded`, `failed`, `expired`, `refunded`, `partially_refunded`.
- Flux Mobile Money typique : l'app crée le paiement (avec `Idempotency-Key`) → le client valide sur son téléphone (« Confirmez sur votre téléphone ») → le PSP notifie le backend par webhook → l'app interroge le statut (polling court) ou reçoit la mise à jour. Si le délai expire : écran « paiement en attente » avec suivi, jamais de double paiement.
- Une transaction ne peut générer deux règlements (RB-003). Réconciliation côté backend.
- Historique des transactions dans le compte client.
- Aucune donnée de carte stockée par AfriSime (PSP tokenisé).

## 7. Livraison et retrait

- Zones avec frais et créneaux paramétrables ; montant minimum éventuel ; livraison gratuite au-delà d'un seuil si paramétré.
- Retrait en agence : choix de l'agence, horaires, code de retrait.
- Suivi : statuts, livreur affecté, preuve de livraison (OTP communiqué au client, photo, signature selon paramétrage).
- Livraison partielle et substitution : le client est informé et, si paramétré, accepte ou refuse la substitution.
- Évaluation de la livraison après clôture.

## 8. Crédit commercial

- **Mon crédit** : plafond, disponible, encours, prochaine échéance, retards, statut (actif, suspendu…).
- **Demande de crédit** : formulaire, pièces justificatives (photo/document), consentements, suivi du statut (en étude, accepté, refusé).
- **Contrat** consultable.
- **Simulation** avant commande ; validation finale par le serveur, adossée à AfriGes.
- **Échéancier** et historique des paiements ; rappels avant échéance ; règles de retard et de suspension selon le contrat.
- **Remboursement** multi-canal : Mobile Money (in-app), caisse/agence, agent terrain. Reçu pour chaque remboursement.
- Les règles de crédit doivent être validées par AfriSime avant le développement final.

## 9. Carnets et packs

- Offres : carnet digital, **Pack Famille**, **Quinzaine**, **Trentaine**, **Pack Revendeur**, selon les offres actives (liste dynamique).
- Souscription, calendrier des versements, montant attendu / payé / restant, versement in-app (même rigueur que le paiement : idempotence, statut serveur).
- **[à confirmer]** : règles de livraison des produits du pack (à la fin, progressive), pénalités, annulation.

## 10. Fidélité, parrainage, promotions

**Fidélité** : points, niveaux, coupons, récompenses, challenges ; historique ; expiration configurable ; programme configurable par segment. Points attribués sur événement confirmé (commande livrée/clôturée), jamais sur une commande annulée (RB-007).

**Parrainage** : code de parrainage, filleuls, récompense après un événement validé (ex. première commande livrée), règles anti-fraude côté serveur.

**Promotions (RB-006)** : coupons, remises quantitatives, packs, ventes flash, offres B2B. Une promotion = période + conditions (stock, agence, segment, minimum, cumulabilité) + statut de publication. Le calcul est toujours serveur ; l'app affiche les offres et applique un code.

**Notifications** : transactionnelles (commande, paiement, livraison, échéance crédit) séparées du marketing ; marketing soumis au consentement (RB-008).

## 11. Support

- FAQ par catégories, ticket, chat, appel, WhatsApp (lien `wa.me`).
- Réclamation rattachée à une commande, avec photos/preuves.
- Ticket : priorité, SLA, affectation, résolution, satisfaction. Escalade vers stock, livraison, crédit ou direction (back-office).

## 12. Règles métier

| ID | Règle |
|---|---|
| RB-001 | **[tronquée dans le PDF, à confirmer]** Prix/stock/offres contextualisés selon le client (segment, agence). |
| RB-002 | Stock et prix revalidés côté serveur au checkout. |
| RB-003 | Une transaction de paiement ne peut générer deux règlements. |
| RB-004 | Commande à crédit uniquement si éligibilité ET disponible suffisant. |
| RB-005 | Toute modification sensible est auditée (prix, stock, crédit, remboursement, annulation). |
| RB-006 | Promotion = période + conditions + statut de publication. |
| RB-007 | Points de fidélité attribués sur événement confirmé, pas sur commande annulée. |
| RB-008 | Notifications marketing soumises au consentement applicable. |
| RB-009 | Annulation et remboursement dépendent du statut de commande. |
| RB-010 | **[tronquée, à confirmer]** Paramètres commerciaux modifiables sans redéploiement de l'app. |

Sécurité (section 8) : TLS ; secrets et sessions stockés de façon sécurisée ; OTP avec limitation des tentatives ; protection contre double paiement, replay, fraude et coupons abusifs ; consentement pour la géolocalisation et le marketing ; tests OWASP Mobile/API avant production.

## 13. Backlog et roadmap

| ID | Fonction | Priorité |
|---|---|---|
| US-001 | Inscription OTP | Must |
| US-002 | Catalogue dynamique | Must |
| US-003 | Recherche/filtres | Must |
| US-004 | Panier | Must |
| US-005 | Checkout | Must |
| US-006 | Paiement | Must |
| US-007 | Commande | Must |
| US-008 | Synchronisation AfriGes | Must (backend) |
| US-009 | Notifications | Must (push = dev build) |
| US-010 | Livraison | Should |
| US-011 | Crédit | Should |
| US-012 | Remboursement | Should |
| US-013 | Fidélité | Should |
| US-014 | Coupons | Should |
| US-015 | Support | Should |
| US-016 | B2B avancé | Could |
| US-017 | Marketplace partenaires | Could |
| US-018 | Recommandations IA | Could |

Roadmap : 0 cadrage → 1 UX/UI (design system, maquettes) → 2 MVP (compte, catalogue, recherche, panier, checkout, commande) → 3 intégration (AfriGes, stock, prix, paiements) → 4 services (livraison, crédit, remboursement, fidélité, support) → 5 stabilisation (sécurité, perf, recette, monitoring) → 6 V2+ (B2B avancé, partenaires, recommandations, multi-pays).

Critères de recette clés : OTP fonctionnel ; recherche et filtres ; prix/stock contextualisés ; commande et paiement de bout en bout ; synchro AfriGes ; suivi de commande ; crédit et remboursement selon règles serveur ; notifications critiques ; promotions administrables ; audit ; **fonctionnement acceptable en réseau dégradé** ; tests de sécurité critiques corrigés.

Scénarios critiques à tester : rupture de stock, double paiement, paiement échoué, remboursement, crédit insuffisant, livraison échouée, connexion instable.

## 14. Inventaire des écrans mobiles

Issu du cahier (écrans 01–13) et complété par le prototype. C'est un inventaire, pas une maquette.

- **Entrée** : splash, onboarding, connexion/inscription par téléphone, OTP, configuration du profil (nom, segment, agence de référence), récupération de compte.
- **Accueil** : recherche, bannières, catégories, ventes flash, nouveautés, meilleures ventes, « produits d'ici », recommandations « pour vous », raccourcis (commander à nouveau, commandes, crédit, points, support), contenus éditoriaux (conseils).
- **Boutique** : liste, filtres, tris ; fiche produit (photos, conditionnements, prix, disponibilité, quantité, « souvent achetés avec », ajouter à une liste).
- **Panier**, **checkout** (réception, adresse, créneau, paiement, crédit, code promo), **paiement** (« confirmez sur votre téléphone », refus, délai dépassé), **confirmation**.
- **Commandes** : en cours, historique, détail et suivi, reçu, annulation, recommander, évaluation de livraison.
- **Crédit** : tableau de bord, conditions d'éligibilité, simulation, demande et suivi, contrat, échéancier, remboursement, historique.
- **Carnets/packs** : offres, souscription, mes carnets, versement.
- **Fidélité** : points, niveau, bons, historique ; parrainage (mes filleuls) ; codes promo.
- **Listes** : favoris, listes d'achats récurrentes.
- **Support** : FAQ, tickets, nouveau ticket/réclamation, chat.
- **Compte** : profil, adresses, moyens de paiement / portefeuille, transactions, documents, notifications, sécurité (PIN, biométrie, appareils connectés), confidentialité et consentements, agences.
