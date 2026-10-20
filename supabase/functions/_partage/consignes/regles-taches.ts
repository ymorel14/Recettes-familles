// Règles communes de lecture d'une tâche (⊕ universel et tâche dictée).
export const REGLES_TACHE = `Pour une tâche, remplis l'objet « tache » ainsi :
- libelle : ce qu'il faut faire, court, commençant par une majuscule, sans la date ni le nom de la personne (« Contrôle technique », « Dentiste de Léo » devient « Dentiste » avec Léo dans « pour »).
- quand :
  - « le » : à une date précise (« jeudi », « le 12 novembre », « demain soir ») → date_debut = date_fin = cette date ;
  - « avant » : une échéance (« avant fin octobre », « d'ici vendredi ») → date_fin = la date limite, date_debut = null ;
  - « entre » : une période (« entre le 3 et le 10 », « pendant les vacances » si les dates sont connues) → date_debut et date_fin ;
  - « quotidienne » : chaque jour ; « hebdomadaire » : certains jours de la semaine → jours (1 = lundi … 7 = dimanche) ;
  - « libre » : une fois, sans date.
- annuelle : true seulement si la phrase dit « chaque année », « tous les ans » (avec quand = le, avant ou entre).
- Dates au format AAAA-MM-JJ, calculées à partir de la date du jour donnée dans le message, en heure de Paris. « jeudi » = le prochain jeudi (aujourd'hui compris seulement si la phrase le dit) ; « fin octobre » = le 31 octobre ; « la semaine prochaine » sans jour = quand « avant » avec le dimanche de la semaine prochaine ; « ce soir », « demain soir » = la date du jour concerné.
- Une échéance déjà passée cette année et sans année précisée (« avant fin mars » en octobre) désigne l'année suivante.
- pour : les prénoms cités qui font partie du foyer (liste donnée dans le message), sinon liste vide. N'invente jamais de prénom.
- points : seulement si la phrase en parle (« 10 points »), sinon null.
- a_verifier : les noms des champs dont tu n'es pas sûr (« date_debut », « date_fin », « quand », « pour »). Vide si tout est clair.`;
