# Jeux de tests de l'assistant

Spécification V1, § 5.4 : pour chaque fonction de l'assistant, un jeu
d'entrées réelles (20 visées par fonction : photos, liens, phrases) avec le
résultat attendu. On le rejoue **avant chaque changement de consigne ou de
modèle**, et on compare.

```
tests/ia/<route>/<nn>-<nom>.json
```

Chaque fichier :

```json
{
  "description": "Ce que le cas vérifie",
  "entree": { "...": "corps envoyé à POST /functions/v1/ia/<route>" },
  "attendu": { "champ": "valeur" }
}
```

Règles de comparaison des champs de `attendu` (les autres champs sont ignorés) :

| Attendu | Réussi si |
| --- | --- |
| `"*"` | le champ existe et n'est pas vide |
| `"~mot"` | le texte contient « mot » (sans tenir compte des majuscules ni des accents) |
| `""`, texte, nombre, booléen | égalité exacte |
| `[n]` (tableau d'un nombre) | tableau d'au moins n éléments |
| objet | mêmes règles, champ par champ |

Une photo s'indique par son chemin, relatif au dossier du cas :
`"image": "@photos/tarte.jpg"` (envoyée en base64).

## Lancer

Avec un **compte de test** membre d'un foyer de test (les appels sont comptés
dans la consommation de ce foyer) :

```bash
SUPABASE_URL=https://xxx.supabase.co SUPABASE_ANON_KEY=... \
TEST_EMAIL=test@exemple.fr TEST_MOT_DE_PASSE=... \
node scripts/rejouer-tests-ia.mjs            # toutes les routes
node scripts/rejouer-tests-ia.mjs essai      # une seule
```

## Fonctions avec photos (étape 5)

`recette-photo`, `planning-photo`, `objet-photo`, `lettre-noel`, `photo-classer` : chaque
dossier contient un cas sans photo (vérifie le message d'erreur) et un **modèle**
(`modele.json.exemple`). Pour ajouter un vrai cas :

1. mettez la photo (ou le PDF) dans `tests/ia/<route>/photos/` ;
2. copiez le modèle en `NN-<nom>.json`, mettez le bon nom de fichier après `@photos/` et le
   résultat attendu.

Les fichiers de `photos/` **ne sont pas envoyés sur GitHub** (`.gitignore`) : lettres
d'enfants, plannings et pages de livres restent sur votre ordinateur. Seuls les `.json` le
sont. Visez 20 cas par fonction (spécification § 5.4) ; une photo coûte environ 0,03 $ par
passage.
