# apps/backoffice — Back-office AfriSime

Application **web** réservée à l'équipe AfriSime (aucun écran d'administration dans l'app mobile).
Conçue pour être intégrée plus tard à AfriGes.

## Démarrer

Le serveur (`apps/api`) doit tourner : `npm run api`.

```bash
# 1. Créer votre compte (une fois) — le mot de passe provisoire s'affiche une seule fois
npm run admin:create -- --email vous@afrisime.tg --name "Votre nom"

# 2. Lancer le back-office
npm run backoffice        # http://localhost:4100
```

À la première connexion : changement du mot de passe provisoire, puis activation du code de vérification
(Google Authenticator, Microsoft Authenticator…) — obligatoire pour le rôle Administrateur.

Mot de passe oublié ou compte bloqué : `npm run admin:create -- --email vous@afrisime.tg --reset`
(nouveau mot de passe provisoire, sessions fermées, 2FA à réactiver).

## Architecture

- **Next.js 16** (App Router, actions serveur), **Tailwind CSS 4**, composants façon shadcn/ui (`src/components/ui`).
- Toutes les données passent par l'API AfriSime (`/v1/admin/*`), appelée **côté serveur uniquement** (`src/lib/api.ts`) :
  le jeton de l'équipe est dans un cookie `httpOnly`, jamais lisible par le navigateur.
- Le serveur AfriSime décide (session, rôle, règles métier) ; le back-office affiche et envoie.
- `src/proxy.ts` renvoie vers la connexion en l'absence de session (contrôle rapide ; la vraie vérification est faite par l'API).

## Rôles

| Rôle | Accès |
|---|---|
| Administrateur | tout, y compris les comptes de l'équipe (2FA obligatoire) |
| Catalogue | produits, prix, promos, stock |
| Commandes | traitement des commandes, encaissements, remboursements |
| Service client | fiches clients, validation des comptes pro |
| Lecture seule | consultation |

## Configuration

`.env.local` (voir `.env.example`) : `API_URL` (par défaut `http://localhost:4000`).
