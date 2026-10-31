import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  dateReprise,
  definirPlafond,
  lireJauge,
  messageErreurAssistant,
  verifierAssistant,
  type JaugeAssistant as Jauge,
} from '../services/assistant';
import { BarreProgression, Bouton, Carte, ControleSegmente } from '../composants/ui';
import { Etincelle, MessageAssistant } from '../composants/assistant';
import { useToast } from '../composants/Toast';
import { couleurs, creerStyles, espaces, polices } from '../theme/theme';

// « Assistant du foyer » dans Moi (charte § 7.8) : jauge du mois en
// pourcentage pour tous ; montant en dollars, plafond et vérification de la
// mise en service pour l'administrateur du foyer seulement.
// Rien ne s'affiche tant que la migration famille_ia n'est pas passée.

const PLAFONDS = ['2', '5', '10', '20'] as const;

export function JaugeAssistant() {
  const { afficher } = useToast();
  const [jauge, setJauge] = useState<Jauge | null>(null);
  const [verification, setVerification] = useState<'' | 'en_cours' | 'ok' | string>('');
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    setJauge(await lireJauge().catch(() => null));
  }, []);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  if (!jauge) return null;

  const pct = Math.max(0, Math.min(100, jauge.pourcentage));
  const couleurBarre = jauge.en_pause ? couleurs.encreDouce : pct >= 80 ? couleurs.attention : couleurs.succes;

  const verifier = async () => {
    setVerification('en_cours');
    try {
      const r = await verifierAssistant();
      setVerification('ok');
      afficher(r.message || 'L’assistant est prêt.');
      await charger();
    } catch (e) {
      setVerification(messageErreurAssistant(e));
    }
  };

  const changerPlafond = async (valeur: string) => {
    setEnCours(true);
    try {
      await definirPlafond(Number(valeur));
      afficher(`Plafond de l’assistant : ${valeur} $ par mois.`);
      await charger();
    } catch {
      afficher('Impossible de changer le plafond pour le moment.');
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Carte style={styles.carte}>
      <View style={styles.ligneTitre}>
        <Etincelle taille={16} />
        <Text style={styles.titre}>Assistant du foyer</Text>
        <Text style={styles.pourcentage}>{pct} %</Text>
      </View>
      <BarreProgression valeur={pct / 100} couleur={couleurBarre} />
      <Text style={styles.detail}>
        {jauge.en_pause
          ? `L’assistant fait une pause jusqu’au ${dateReprise(jauge.reprise_le)}. Tout le reste de l’app fonctionne.`
          : `${pct} % du mois utilisé.${pct >= 80 ? ` Il reste un peu de marge jusqu’au ${dateReprise(jauge.reprise_le)}.` : ''}`}
      </Text>

      {jauge.administrateur ? (
        <View style={styles.admin}>
          {jauge.utilise_usd != null && jauge.plafond_usd != null ? (
            <Text style={styles.detail}>
              Ce mois-ci : {jauge.utilise_usd.toFixed(2).replace('.', ',')} $ sur {jauge.plafond_usd.toFixed(0)} $ (visible par vous seul, administrateur du foyer).
            </Text>
          ) : null}
          <Text style={styles.sousTitre}>Plafond mensuel</Text>
          <ControleSegmente
            options={PLAFONDS.map((p) => ({ id: p, libelle: `${p} $` }))}
            valeur={(PLAFONDS.find((p) => Number(p) === jauge.plafond_usd) ?? '5') as (typeof PLAFONDS)[number]}
            onChange={(v) => !enCours && changerPlafond(v)}
          />
          {verification && verification !== 'en_cours' && verification !== 'ok' ? (
            <MessageAssistant message={verification} />
          ) : null}
          <Bouton
            variante="secondaire"
            petit
            titre={verification === 'ok' ? 'L’assistant répond bien' : 'Vérifier l’assistant'}
            icone={verification === 'ok' ? 'checkmark-circle-outline' : undefined}
            enCours={verification === 'en_cours'}
            onPress={verifier}
          />
        </View>
      ) : null}
    </Carte>
  );
}

const styles = creerStyles(() => ({
  carte: { gap: espaces.m },
  ligneTitre: { flexDirection: 'row', alignItems: 'center', gap: espaces.s },
  titre: { flex: 1, fontFamily: polices.texteGras, fontSize: 16, color: couleurs.encre },
  pourcentage: { fontFamily: polices.texteGras, fontSize: 15, color: couleurs.encre, fontVariant: ['tabular-nums'] },
  detail: { fontFamily: polices.texte, fontSize: 13, lineHeight: 18, color: couleurs.encreDouce },
  sousTitre: { fontFamily: polices.texteGras, fontSize: 14, color: couleurs.encre },
  admin: { gap: espaces.m, borderTopWidth: 1, borderTopColor: couleurs.separateur, paddingTop: espaces.m },
}));
