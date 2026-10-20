import React, { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { FeuilleBas } from './FeuilleBas';
import { Bouton } from './ui';
import { ChampAssistant } from './ChampAssistant';
import { ChargementAssistant, Etincelle, MessageAssistant } from './assistant';
import { appelerAssistant, ErreurAssistant, messageErreurAssistant } from '../services/assistant';
import { arrondis, couleurs, creerStyles, espaces, polices } from '../theme/theme';

// Feuille « dire ou écrire » pour une fonction de l'assistant à l'endroit
// de l'action (charte § 7.1) : tâche dictée, etc. Le résultat part dans le
// formulaire habituel, pré-rempli (§ 7.3) ; rien n'est enregistré ici.
export function FeuilleDictee<T>({
  visible,
  titre,
  placeholder,
  exemples,
  route,
  etapes,
  couleur,
  onResultat,
  onFermer,
  remplirALaMain,
}: {
  visible: boolean;
  titre: string;
  placeholder: string;
  exemples?: string[];
  route: string;
  etapes?: string[];
  couleur?: string;
  // Renvoie une question à afficher si le résultat ne suffit pas, sinon null
  // (et la feuille se ferme).
  onResultat: (r: T) => string | null;
  onFermer: () => void;
  remplirALaMain?: () => void;
}) {
  const [texte, setTexte] = useState('');
  const [lecture, setLecture] = useState(false);
  const [message, setMessage] = useState<{ texte: string; pause?: boolean; question?: boolean } | null>(null);
  const annulation = useRef<AbortController | null>(null);

  const fermer = () => {
    annulation.current?.abort();
    setLecture(false);
    setMessage(null);
    setTexte('');
    onFermer();
  };

  const envoyer = async () => {
    if (!texte.trim()) return;
    setMessage(null);
    setLecture(true);
    const controle = new AbortController();
    annulation.current = controle;
    try {
      const r = await appelerAssistant<T>(route, { texte: texte.trim() }, { signal: controle.signal });
      if (controle.signal.aborted) return;
      const question = onResultat(r);
      if (question) {
        setMessage({ texte: question, question: true });
      } else {
        setTexte('');
        onFermer();
      }
    } catch (e) {
      if (controle.signal.aborted) return;
      setMessage({ texte: messageErreurAssistant(e), pause: e instanceof ErreurAssistant && e.code === 'plafond' });
    } finally {
      setLecture(false);
    }
  };

  return (
    <FeuilleBas visible={visible} titre={titre} onFermer={fermer}>
      {lecture ? (
        <ChargementAssistant
          etapes={etapes}
          couleur={couleur}
          onAnnuler={() => {
            annulation.current?.abort();
            setLecture(false);
          }}
        />
      ) : (
        <>
          <ChampAssistant valeur={texte} onChange={setTexte} onValider={envoyer} placeholder={placeholder} exemples={exemples} autoFocus />
          {message?.question ? (
            <View style={styles.question}>
              <Etincelle couleur={couleur} />
              <Text style={styles.questionTexte}>{message.texte}</Text>
            </View>
          ) : message ? (
            <MessageAssistant
              message={message.texte}
              pause={message.pause}
              onRemplirALaMain={
                remplirALaMain
                  ? () => {
                      fermer();
                      remplirALaMain();
                    }
                  : undefined
              }
            />
          ) : null}
          <Bouton titre="Envoyer à l’assistant" icone="arrow-up" onPress={envoyer} desactive={!texte.trim()} />
        </>
      )}
    </FeuilleBas>
  );
}

const styles = creerStyles(() => ({
  question: {
    flexDirection: 'row',
    gap: espaces.s,
    alignItems: 'flex-start',
    padding: espaces.l,
    borderRadius: arrondis.champ,
    backgroundColor: couleurs.segment,
  },
  questionTexte: { flex: 1, fontFamily: polices.texteDemiGras, fontSize: 15, lineHeight: 21, color: couleurs.encre },
}));
