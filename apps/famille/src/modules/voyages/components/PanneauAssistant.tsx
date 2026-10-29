import React, { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { BoutonAssistant, ChargementAssistant, Etincelle, MessageAssistant } from '../../../composants/assistant';
import { ErreurAssistant, messageErreurAssistant } from '../../../services/assistant';
import { ajouterSuggestions, demanderSuggestion, type AjoutSuggere, type SuggestionEvenement } from '../services/idees';
import { Bouton } from './ui';

// Panneau « ✦ Assistant » de la page d'un événement (refonte § 8.1) :
// trois suggestions selon la nature, une réponse courte et, quand il y en a,
// des ajouts à cocher. Rien n'est ajouté sans que l'organisateur touche
// « Ajouter » ; les autres participants lisent seulement la réponse.

type Contexte = {
  titre: string;
  destination: string | null;
  dateDebut: string | null;
  dateFin: string | null;
  nbPersonnes: number;
  activites?: string[];
  logement?: string | null;
  budgetTotal?: number;
  plats?: { titre: string; categorie: string }[];
};

const SUGGESTIONS: Record<'voyage' | 'repas', { id: SuggestionEvenement; libelle: string }[]> = {
  voyage: [
    { id: 'programme', libelle: 'Compléter le programme' },
    { id: 'pluie', libelle: 'Idées pour un jour de pluie' },
    { id: 'budget', libelle: 'Réduire le budget' },
  ],
  repas: [
    { id: 'equilibrer', libelle: 'Équilibrer le menu' },
    { id: 'quantites', libelle: 'Quantités pour les invités' },
    { id: 'dessert', libelle: 'Idées de dessert' },
  ],
};

export function PanneauAssistant({
  nature,
  voyageId,
  repasId,
  organisateur,
  contexte,
  onAjoute,
}: {
  nature: 'voyage' | 'repas';
  voyageId: string;
  repasId: string | null;
  organisateur: boolean;
  contexte: Contexte;
  onAjoute: () => void | Promise<void>;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [choix, setChoix] = useState<SuggestionEvenement | null>(null);
  const [chargement, setChargement] = useState(false);
  const [reponse, setReponse] = useState<string | null>(null);
  const [ajouts, setAjouts] = useState<AjoutSuggere[]>([]);
  const [coches, setCoches] = useState<Set<number>>(new Set());
  const [erreur, setErreur] = useState<ErreurAssistant | null>(null);
  const [ajoutEnCours, setAjoutEnCours] = useState(false);
  const [confirme, setConfirme] = useState<string | null>(null);
  const annulation = useRef<AbortController | null>(null);

  const demander = async (s: SuggestionEvenement) => {
    const controle = new AbortController();
    annulation.current = controle;
    setChoix(s);
    setChargement(true);
    setErreur(null);
    setReponse(null);
    setAjouts([]);
    setConfirme(null);
    try {
      const r = await demanderSuggestion({ nature, suggestion: s, ...contexte, signal: controle.signal });
      if (controle.signal.aborted) return;
      setReponse(r.reponse);
      setAjouts(r.ajouts);
      setCoches(new Set(r.ajouts.map((_, i) => i)));
    } catch (e) {
      if (controle.signal.aborted) return;
      setErreur(e instanceof ErreurAssistant ? e : new ErreurAssistant('indisponible', messageErreurAssistant(e)));
    } finally {
      if (!controle.signal.aborted) setChargement(false);
    }
  };

  const ajouter = async () => {
    const liste = ajouts.filter((_, i) => coches.has(i));
    if (!liste.length) return;
    setAjoutEnCours(true);
    setErreur(null);
    try {
      const n = await ajouterSuggestions({ voyageId, repasId, ajouts: liste });
      setConfirme(
        nature === 'repas'
          ? `${n} plat${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''} au repas.`
          : `${n} idée${n > 1 ? 's' : ''} ajoutée${n > 1 ? 's' : ''} au voyage, à décider ensemble.`
      );
      setAjouts([]);
      await onAjoute();
    } catch (e) {
      setErreur(new ErreurAssistant('indisponible', 'Impossible d’ajouter pour l’instant. Réessayez dans un moment.'));
    } finally {
      setAjoutEnCours(false);
    }
  };

  if (!ouvert) {
    return (
      <BoutonAssistant titre="Assistant" onPress={() => setOuvert(true)} couleur={theme.colors.accent} />
    );
  }

  return (
    <View style={styles.panneau}>
      <View style={styles.ligne}>
        <Etincelle couleur={theme.colors.accent} />
        <Text style={styles.titre}>Assistant</Text>
        <Pressable onPress={() => { annulation.current?.abort(); setOuvert(false); }} accessibilityRole="button" accessibilityLabel="Fermer l’assistant" hitSlop={8}>
          <Ionicons name="close" size={20} color={theme.colors.text} />
        </Pressable>
      </View>

      {chargement ? (
        <ChargementAssistant
          etapes={['Je regarde ce qui est prévu…', 'Je prépare des idées…']}
          couleur={theme.colors.accent}
          onAnnuler={() => { annulation.current?.abort(); setChargement(false); }}
        />
      ) : (
        <View style={styles.suggestions}>
          {SUGGESTIONS[nature].map((s) => (
            <Pressable
              key={s.id}
              onPress={() => demander(s.id)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.suggestion, choix === s.id && styles.suggestionActive, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.suggestionTexte}>{s.libelle}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {erreur ? <MessageAssistant message={erreur.message} pause={erreur.code === 'plafond'} /> : null}

      {reponse && !chargement ? (
        <View style={styles.reponse}>
          <Text style={styles.reponseTexte}>{reponse}</Text>
          {ajouts.length > 0 ? (
            <View style={{ gap: theme.spacing.xs }}>
              {ajouts.map((a, i) => {
                const coche = coches.has(i);
                return (
                  <Pressable
                    key={`${a.titre}|${i}`}
                    disabled={!organisateur}
                    onPress={() =>
                      setCoches((anc) => {
                        const n = new Set(anc);
                        if (n.has(i)) n.delete(i);
                        else n.add(i);
                        return n;
                      })
                    }
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: coche, disabled: !organisateur }}
                    style={styles.ajout}
                  >
                    {organisateur ? <Ionicons name={coche ? 'checkbox' : 'square-outline'} size={22} color={theme.colors.accent} /> : null}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.ajoutTitre}>{a.titre}</Text>
                      {a.detail ? <Text style={styles.ajoutDetail}>{a.detail}</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
              {organisateur ? (
                <Bouton
                  titre={nature === 'repas' ? 'Ajouter au repas' : 'Ajouter au voyage'}
                  desactive={coches.size === 0}
                  enCours={ajoutEnCours}
                  onPress={ajouter}
                />
              ) : (
                <Text style={styles.ajoutDetail}>Seul un organisateur peut les ajouter.</Text>
              )}
            </View>
          ) : null}
        </View>
      ) : null}

      {confirme ? <Text style={styles.confirme}>{confirme}</Text> : null}
    </View>
  );
}

const styles = creerStylesThemes(() => ({
  panneau: {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  titre: { flex: 1, fontFamily: theme.fontTitle, fontSize: 16, color: theme.colors.text },
  suggestions: { gap: theme.spacing.xs },
  suggestion: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minHeight: 44,
    justifyContent: 'center',
  },
  suggestionActive: { borderColor: theme.colors.accent },
  suggestionTexte: { color: theme.colors.text, fontSize: 15 },
  reponse: { gap: theme.spacing.sm },
  reponseTexte: { color: theme.colors.text, fontSize: 15, lineHeight: 22 },
  ajout: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, minHeight: 44 },
  ajoutTitre: { color: theme.colors.text, fontSize: 15, fontWeight: '600' },
  ajoutDetail: { color: theme.colors.text, fontSize: 13, opacity: 0.7 },
  confirme: { color: theme.colors.text, fontSize: 14 },
}));
