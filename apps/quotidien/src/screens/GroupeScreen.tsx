import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { Carte, TitreSection } from '../components/elements';
import { Bouton, Chargement } from '../components/ui';
import { alerte } from '../utils/alerte';
import { extraireMessageErreur } from '@apps-famille/famille';
import { listerPersonnes, formaterDate, type Personne } from '../services/personnes';
import {
  adresseInvite,
  ajouterEnfant,
  ajouterInvite,
  equite,
  heureCourte,
  JOURS,
  lienInvite,
  listerActivites,
  listerEnfants,
  listerGroupes,
  listerParticipants,
  obtenirCodeGroupe,
  quitterGroupe,
  renommerParticipant,
  retirerEnfant,
  retirerInvite,
  supprimerActivite,
  type Activite,
  type Enfant,
  type Groupe,
  type LigneEquite,
  type Participant,
} from '../services/quotidien';

// Un groupe : code à partager, mes enfants, parents (dont invités sans
// compte), activités, équité des trajets, quitter le groupe.
export default function GroupeScreen({ route, navigation }: any) {
  const id: string = route.params.id;
  const { session, foyer } = useAuth();
  const [groupe, setGroupe] = useState<Groupe | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [enfants, setEnfants] = useState<Enfant[]>([]);
  const [activites, setActivites] = useState<Activite[]>([]);
  const [lignesEquite, setLignesEquite] = useState<LigneEquite[]>([]);
  const [personnesFoyer, setPersonnesFoyer] = useState<Personne[]>([]);
  const [prenom, setPrenom] = useState('');
  const [nomInvite, setNomInvite] = useState('');
  const [monNom, setMonNom] = useState('');
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const [gs, ps, as, eq] = await Promise.all([
        listerGroupes(),
        listerParticipants([id]),
        listerActivites([id]),
        equite(id),
      ]);
      const g = gs.find((x) => x.id === id) ?? null;
      setGroupe(g);
      setParticipants(ps);
      setActivites(as);
      setLignesEquite(eq);
      setEnfants(await listerEnfants(ps.map((p) => p.id)));
      const moi = ps.find((p) => p.foyer_id === foyer?.id && !p.parti_le);
      setMonNom(moi?.nom_affiche ?? '');
      if (foyer) setPersonnesFoyer((await listerPersonnes([foyer.id])).filter((p) => !p.utilisateur_id));
      navigation.setOptions({ title: g?.nom ?? 'Groupe' });
    } catch (e) {
      alerte('Chargement impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
    }
  }, [id, foyer, navigation]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  const agir = async (cle: string, action: () => Promise<unknown>, rechargerApres = true) => {
    setEnCours(cle);
    try {
      await action();
      if (rechargerApres) await charger();
    } catch (e) {
      alerte('Action impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
    } finally {
      setEnCours(null);
    }
  };

  if (!groupe) return <Chargement />;

  const actifs = participants.filter((p) => !p.parti_le);
  const moi = actifs.find((p) => p.foyer_id === foyer?.id) ?? null;
  const mesEnfants = moi ? enfants.filter((e) => e.participant_id === moi.id) : [];
  const dejaAjoutes = new Set(mesEnfants.map((e) => e.prenom.trim().toLowerCase()));
  const suggestions = personnesFoyer.filter((p) => p.prenom_renseigne && !dejaAjoutes.has(p.prenom.trim().toLowerCase()));
  const max = Math.max(1, ...lignesEquite.map((l) => l.trajets));

  const partagerCode = () =>
    agir(
      'code',
      async () => {
        const c = await obtenirCodeGroupe(id);
        await Share.share({
          message: `Rejoins le groupe de covoiturage « ${groupe.nom} » sur l'app Quotidien avec le code : ${c.code} (valable jusqu'au ${new Date(c.expire_le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}).`,
        });
      },
      false
    );

  const envoyerLien = (p: Participant, jeton?: string) =>
    agir(
      'lien' + p.id,
      async () => {
        const j = jeton ?? (await lienInvite(p.id));
        if (!j) throw new Error('Lien introuvable.');
        await Share.share({
          message: `Bonjour ${p.nom_affiche}, voici le lien pour voir et prendre les trajets du groupe « ${groupe.nom} », sans créer de compte : ${adresseInvite(j)}`,
        });
      },
      false
    );

  const inviter = () =>
    agir('invite', async () => {
      const nom = nomInvite.trim();
      const jeton = await ajouterInvite(id, nom);
      setNomInvite('');
      await charger();
      await Share.share({
        message: `Bonjour ${nom}, voici le lien pour voir et prendre les trajets du groupe « ${groupe.nom} », sans créer de compte : ${adresseInvite(jeton)}`,
      });
    }, false);

  const quitter = () =>
    alerte('Quitter ce groupe ?', 'Vous ne verrez plus ses trajets, et vos trajets à venir seront libérés.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Quitter',
        style: 'destructive',
        onPress: () =>
          agir('quitter', async () => {
            await quitterGroupe(id);
            navigation.goBack();
          }, false),
      },
    ]);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      <Bouton titre="Inviter des parents (code du groupe)" onPress={partagerCode} enCours={enCours === 'code'} />

      <TitreSection titre="Mes enfants" detail="prénom seulement" />
      <Carte>
        {mesEnfants.length === 0 && <Text style={styles.aide}>Ajoutez les enfants que vous emmenez ou faites emmener.</Text>}
        {mesEnfants.map((e) => (
          <View key={e.id} style={styles.ligne}>
            <Text style={styles.nom}>{e.prenom}</Text>
            <Pressable onPress={() => agir(e.id, () => retirerEnfant(e.id))} hitSlop={8} accessibilityRole="button">
              <Text style={styles.lienDiscret}>Retirer</Text>
            </Pressable>
          </View>
        ))}
        {moi && suggestions.length > 0 && (
          <View style={styles.puces}>
            {suggestions.map((p) => (
              <Pressable
                key={p.id}
                style={styles.puce}
                onPress={() => agir('p' + p.id, () => ajouterEnfant(moi.id, p.prenom, p.id))}
                accessibilityRole="button"
                accessibilityLabel={`Ajouter ${p.prenom}`}
              >
                <Text style={styles.puceTexte}>+ {p.prenom}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {moi && (
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
              onPress={() => agir('enfant', async () => { await ajouterEnfant(moi.id, prenom); setPrenom(''); })}
              enCours={enCours === 'enfant'}
              desactive={!prenom.trim()}
            />
          </View>
        )}
      </Carte>

      <TitreSection titre="Activités" />
      {activites.map((a) => (
        <Carte key={a.id}>
          <Text style={styles.nom}>{a.nom}</Text>
          <Text style={styles.aide}>
            Le {JOURS[a.jour_semaine - 1]} de {heureCourte(a.heure_debut)} à {heureCourte(a.heure_fin)}
            {a.lieu ? ` · ${a.lieu}` : ''}
          </Text>
          <Text style={styles.aide}>
            Du {formaterDate(a.date_debut)} au {formaterDate(a.date_fin)}
          </Text>
          <Pressable
            onPress={() =>
              alerte(`Supprimer « ${a.nom} » ?`, 'Ses séances et leurs trajets seront supprimés.', [
                { text: 'Annuler', style: 'cancel' },
                { text: 'Supprimer', style: 'destructive', onPress: () => agir(a.id, () => supprimerActivite(a.id)) },
              ])
            }
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text style={styles.lienDiscret}>Supprimer</Text>
          </Pressable>
        </Carte>
      ))}
      <Bouton
        variante="pointille"
        titre="Ajouter une activité"
        onPress={() => navigation.navigate('ActiviteForm', { groupeId: id, zone: groupe.zone_vacances })}
      />

      <TitreSection titre="Parents" detail={`${actifs.length}`} />
      <Carte>
        {actifs.map((p) => {
          const invite = !p.foyer_id;
          const ajouteParMoi = invite && p.invite_par === session?.user.id;
          return (
            <View key={p.id} style={styles.ligne}>
              <Text style={styles.nom}>
                {p.nom_affiche}
                {p.id === moi?.id ? ' (vous)' : ''}
              </Text>
              {invite && <Text style={styles.aide}>sans compte</Text>}
              {ajouteParMoi && (
                <>
                  <Pressable onPress={() => envoyerLien(p)} hitSlop={8} accessibilityRole="button">
                    <Text style={styles.lien}>Lien</Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      alerte(`Retirer ${p.nom_affiche} ?`, 'Son lien ne fonctionnera plus et ses trajets à venir seront libérés.', [
                        { text: 'Annuler', style: 'cancel' },
                        { text: 'Retirer', style: 'destructive', onPress: () => agir(p.id, () => retirerInvite(p.id)) },
                      ])
                    }
                    hitSlop={8}
                    accessibilityRole="button"
                  >
                    <Text style={styles.lienDiscret}>Retirer</Text>
                  </Pressable>
                </>
              )}
            </View>
          );
        })}
        <Text style={styles.sousTitre}>Inviter un parent sans compte</Text>
        <Text style={styles.aide}>Il reçoit un lien pour voir et prendre les trajets, sans créer de compte.</Text>
        <View style={styles.ligneSaisie}>
          <TextInput
            style={[styles.champ, { flex: 1 }]}
            value={nomInvite}
            onChangeText={setNomInvite}
            placeholder="Son prénom (ex. Sophie)"
            placeholderTextColor={theme.colors.textMuted}
            accessibilityLabel="Prénom du parent invité"
          />
          <Bouton titre="Inviter" onPress={inviter} enCours={enCours === 'invite'} desactive={!nomInvite.trim()} />
        </View>
        {moi && (
          <>
            <Text style={styles.sousTitre}>Mon nom dans ce groupe</Text>
            <View style={styles.ligneSaisie}>
              <TextInput
                style={[styles.champ, { flex: 1 }]}
                value={monNom}
                onChangeText={setMonNom}
                accessibilityLabel="Mon nom dans ce groupe"
              />
              {monNom.trim() && monNom.trim() !== moi.nom_affiche && (
                <Bouton titre="OK" onPress={() => agir('nom', () => renommerParticipant(moi.id, monNom))} enCours={enCours === 'nom'} />
              )}
            </View>
          </>
        )}
      </Carte>

      <TitreSection titre="Équité" detail="trajets assurés" />
      <Carte>
        {lignesEquite.map((l) => (
          <View key={l.participant_id} style={styles.equite}>
            <Text style={[styles.equiteNom, l.parti && { color: theme.colors.textMuted }]} numberOfLines={1}>
              {l.nom_affiche}
            </Text>
            <View style={styles.barreFond}>
              <View style={[styles.barre, { width: `${(l.trajets / max) * 100}%` }]} />
            </View>
            <Text style={styles.equiteNombre}>{l.trajets}</Text>
          </View>
        ))}
      </Carte>

      <Bouton variante="discret" titre="Quitter ce groupe" onPress={quitter} desactive={enCours !== null} />
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, minHeight: 36 },
  ligneSaisie: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  nom: { flex: 1, fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text },
  sousTitre: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.text, marginTop: theme.spacing.sm },
  aide: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  lien: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.accent },
  lienDiscret: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted, textDecorationLine: 'underline' },
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
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  puce: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: theme.colors.accent,
  },
  puceTexte: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.accent },
  equite: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, minHeight: 28 },
  equiteNom: { width: 110, fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.text },
  barreFond: { flex: 1, height: 10, borderRadius: 5, backgroundColor: theme.colors.selectionTransparent },
  barre: { height: 10, borderRadius: 5, backgroundColor: theme.colors.accent },
  equiteNombre: { width: 24, textAlign: 'right', fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.text },
}));
