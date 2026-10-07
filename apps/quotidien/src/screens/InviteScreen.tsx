import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { Carte, TitreSection } from '../components/elements';
import CarteTrajet from '../components/CarteTrajet';
import { Bouton, Chargement, MessageVide } from '../components/ui';
import { alerte } from '../utils/alerte';
import { extraireMessageErreur } from '@apps-famille/famille';
import {
  ajouterEnfantInvite,
  inscrireEnfantInvite,
  laisserTrajetInvite,
  libelleJour,
  prendreTrajetInvite,
  vueInvite,
  type VueInvite,
} from '../services/quotidien';

// Page d'un parent invité SANS compte, ouverte par son lien
// (<site>/quotidien/invite/<jeton>) : il voit les trajets des six prochaines
// semaines du groupe, en prend ou en laisse, et inscrit ses enfants.
// Tout passe par les fonctions *_invite de la base, qui vérifient le jeton.
export default function InviteScreen({ jeton }: { jeton: string }) {
  const [vue, setVue] = useState<VueInvite | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [prenom, setPrenom] = useState('');
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      setVue(await vueInvite(jeton));
      setErreur(null);
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Lien invalide ou expiré.'));
    }
  }, [jeton]);

  useEffect(() => {
    charger();
  }, [charger]);

  const agir = async (cle: string, action: () => Promise<void>) => {
    setEnCours(cle);
    try {
      await action();
      await charger();
    } catch (e) {
      alerte('Action impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
    } finally {
      setEnCours(null);
    }
  };

  if (erreur) {
    return (
      <View style={styles.flex}>
        <MessageVide titre="Lien invalide ou expiré" texte="Demandez un nouveau lien au parent qui vous a invité." />
      </View>
    );
  }
  if (!vue) return <Chargement />;

  const nom = (id: string | null) => vue.participants.find((p) => p.id === id)?.nom_affiche ?? null;
  const moiNom = nom(vue.moi);
  const jours = Array.from(new Set(vue.trajets.map((t) => t.date)));

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      <Text style={styles.titre}>{vue.groupe.nom}</Text>
      <Text style={styles.aide}>
        Bonjour {moiNom} ! Voici les trajets des six prochaines semaines. Pas besoin de compte : gardez ce lien pour
        revenir.
      </Text>

      <TitreSection titre="Mes enfants" />
      <Carte>
        {vue.mes_enfants.length === 0 && (
          <Text style={styles.aide}>Ajoutez le prénom de vos enfants pour les inscrire aux trajets.</Text>
        )}
        {vue.mes_enfants.map((e) => (
          <Text key={e.id} style={styles.nom}>
            {e.prenom}
          </Text>
        ))}
        <View style={styles.ligneSaisie}>
          <TextInput
            style={[styles.champ, { flex: 1 }]}
            value={prenom}
            onChangeText={setPrenom}
            placeholder="Prénom"
            placeholderTextColor={theme.colors.textMuted}
            accessibilityLabel="Prénom de l'enfant"
          />
          <Bouton
            titre="Ajouter"
            onPress={() => agir('enfant', async () => { await ajouterEnfantInvite(jeton, prenom); setPrenom(''); })}
            enCours={enCours === 'enfant'}
            desactive={!prenom.trim()}
          />
        </View>
      </Carte>

      {jours.length === 0 ? (
        <MessageVide titre="Aucun trajet à venir" />
      ) : (
        jours.map((jour) => (
          <View key={jour} style={styles.jour}>
            <TitreSection titre={libelleJour(jour)} />
            {vue.trajets
              .filter((t) => t.date === jour)
              .map((t) => (
                <CarteTrajet
                  key={t.id}
                  trajet={t}
                  conducteur={nom(t.conducteur_id)}
                  moi={t.conducteur_id === vue.moi}
                  mesEnfants={vue.mes_enfants}
                  enCours={enCours === t.id}
                  onPrendre={() => agir(t.id, () => prendreTrajetInvite(jeton, t.id))}
                  onLaisser={() => agir(t.id, () => laisserTrajetInvite(jeton, t.id))}
                  onBasculerEnfant={(e, oui) => agir(t.id, () => inscrireEnfantInvite(jeton, t.id, e, oui))}
                />
              ))}
          </View>
        ))
      )}
      <Text style={[styles.aide, { textAlign: 'center' }]}>
        Quotidien — l'app des familles pour les trajets, les tâches et l'argent de poche.
      </Text>
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl, paddingTop: theme.spacing.lg },
  titre: { fontFamily: theme.fontTitle, fontSize: 28, color: theme.colors.accent },
  jour: { gap: theme.spacing.sm },
  nom: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text },
  aide: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  ligneSaisie: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  champ: {
    minHeight: 44,
    backgroundColor: theme.colors.background,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.sm,
    color: theme.colors.text,
    fontFamily: theme.fontBody,
    fontSize: 16,
  },
}));
