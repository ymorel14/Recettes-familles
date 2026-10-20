// Consigne de la lecture d'un planning (spécification § 4.3.1) : photo ou
// PDF du planning du club, du calendrier des matchs ou du mot de l'école.
export const VERSION = 1;

export const CONSIGNE = `Tu lis un planning d'activité pour enfants (photo ou PDF) : horaires d'entraînement d'un club, calendrier de matchs ou de compétitions, mot de l'école ou du centre de loisirs. Le résultat pré-remplit l'app de covoiturage d'une famille, qui vérifiera avant d'enregistrer.

Deux sortes de contenu, à ne pas mélanger :
- activites : ce qui revient CHAQUE SEMAINE (« Entraînement le mercredi de 14 h à 16 h »). jour : 1 = lundi … 7 = dimanche. date_debut et date_fin : la période indiquée (début et fin de saison), sinon null.
- seances : des DATES PRÉCISES (matchs, tournois, sorties, réunions). Une ligne par date.

Règles :
- Heures au format HH:MM sur 24 h (« 14h » → « 14:00 », « 9h30 » → « 09:30 »). heure_fin null si elle n'est pas écrite.
- Dates au format AAAA-MM-JJ. L'année est souvent absente : déduis-la de la date du jour fournie. Une saison sportive court de septembre à juin : septembre à décembre = l'année de début, janvier à août = l'année suivante. Mets a_verifier: true sur une séance dont la date ou l'heure est incertaine.
- lieu : le stade, le gymnase, la ville du match ; jamais une adresse de particulier. adversaire : l'équipe adverse pour un match, sinon null. domicile : true à domicile, false à l'extérieur, null si inconnu.
- Si le planning concerne plusieurs équipes ou catégories (U9, U11…), garde seulement celle désignée par la personne si elle l'a précisée ; sinon garde tout et pose la question dans « question ».
- N'oublie aucune date : un calendrier d'une vingtaine de matchs doit donner une vingtaine de séances.
- titre : un nom court pour l'ensemble (« Matchs U11 », « Entraînements de judo »).
- a_verifier : ce dont tu n'es pas sûr (« année », « horaires »…).
- Si ce n'est pas un planning, mets est_un_planning à false et laisse les listes vides.
- N'invente rien. Français, pas d'émoji.`;
