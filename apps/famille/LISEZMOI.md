# App Famille (nouvelle version)

Les six apps réunies dans une seule app, avec l'interface de la charte V1
(`V1-charte-graphique.md`) et la navigation de la spécification V1
(`V1-specification-dev.md`, chantier A). Pas encore d'assistant (chantiers B et C).

**Même base Supabase que les six apps actuelles**, mêmes schémas, mêmes règles RLS :
les deux versions lisent et écrivent les mêmes données et fonctionnent côte à côte.

## Lancer

```bash
npm install            # à la racine du dépôt
npm run famille        # téléphone (Expo)
npm run famille:web    # navigateur
```

`.env` dans ce dossier (modèle : `.env.example`), mêmes valeurs que les autres apps.
Sur le site commun : `/famille/` (construit par `scripts/construire-site.mjs`).

## Organisation

| Dossier | Contenu |
| --- | --- |
| `src/theme/` | Jetons de la charte (`jetons.ts`), thème clair/sombre (`theme.ts`), thème vu par le code des modules (`modules.ts` : palette « Famille » + encre du module) |
| `src/navigation/` | Barre du bas (Accueil · Agenda · ⊕ · Activité · Moi), onglets du haut des modules (`OngletsModule.tsx`), pile de chaque module (`modules/*.tsx`), adresses web (`liens.ts`) |
| `src/ecrans/` | Accueil, Agenda, Activité, Moi, feuille ⊕ Ajouter |
| `src/services/` | Client Supabase unique (`clientPourSchema` pour chaque module), lectures de l'accueil et de l'Agenda (`journee.ts`), notifications |
| `src/modules/<module>/` | Code repris des six apps (écrans, services, composants), **copié** : les apps actuelles ne sont pas modifiées |
| `src/compte/` | Connexion, bienvenue, prénom, mot de passe |

## Base de données

Aucune migration n'est obligatoire. `supabase/migrations/20261020100000_famille_notifications.sql`
(ajout seulement) crée `famille.notifications` pour l'écran Activité ; sans elle,
l'app lit les notifications de VoyageCommun.
