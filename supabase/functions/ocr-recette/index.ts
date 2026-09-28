// Fonction Edge Supabase : reconnaissance de texte (OCR) sur la photo d'une
// recette, via l'API Google Cloud Vision (cahier des charges §5, feuille de
// route §7 — Phase 2).
//
// La clé d'API Google Cloud Vision NE DOIT JAMAIS être exposée côté client
// (elle serait visible dans l'app mobile décompilée ou dans le bundle web) :
// elle vit uniquement ici, comme secret de ce projet Supabase.
//
// Déploiement (une fois, depuis un poste avec la CLI Supabase installée) :
//   supabase functions deploy ocr-recette
//   supabase secrets set GOOGLE_VISION_API_KEY=<votre clé Google Cloud Vision>
//
// Appelée par l'app via supabase.functions.invoke('ocr-recette', { body: { image } })
// où `image` est le contenu de la photo encodé en base64 (sans préfixe data:).

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Bloc = { id: string; texte: string };

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const cleApi = Deno.env.get('GOOGLE_VISION_API_KEY');
    if (!cleApi) {
      return reponseErreur(
        "La clé Google Cloud Vision n'est pas configurée sur ce projet Supabase (secret GOOGLE_VISION_API_KEY).",
        500
      );
    }

    const { image } = await req.json();
    if (!image || typeof image !== 'string') {
      return reponseErreur('Aucune image reçue.', 400);
    }

    const reponseVision = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${cleApi}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            image: { content: image },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            imageContext: { languageHints: ['fr'] },
          },
        ],
      }),
    });

    const donnees = await reponseVision.json();
    const erreurVision = donnees?.responses?.[0]?.error ?? (!reponseVision.ok ? donnees?.error : null);
    if (erreurVision) {
      return reponseErreur(
        `Échec de la reconnaissance de texte : ${erreurVision.message ?? 'erreur inconnue de Google Vision.'}`,
        502
      );
    }

    const blocs = extraireBlocs(donnees?.responses?.[0]?.fullTextAnnotation);

    return new Response(JSON.stringify({ blocs }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return reponseErreur(e instanceof Error ? e.message : 'Erreur inattendue.', 500);
  }
});

function reponseErreur(message: string, statut: number): Response {
  return new Response(JSON.stringify({ erreur: message }), {
    status: statut,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// Reconstitue, pour chaque bloc détecté par Google Vision (une zone de texte
// visuellement séparée sur la photo — typiquement un paragraphe ou un
// groupe de lignes), le texte qu'il contient, en respectant les sauts de
// ligne détectés — ce sont ces blocs que l'écran de scan affiche comme
// "zones sélectionnables" (cahier des charges §5).
function extraireBlocs(fullTextAnnotation: any): Bloc[] {
  const pages = fullTextAnnotation?.pages ?? [];
  const blocs: Bloc[] = [];
  let index = 0;

  for (const page of pages) {
    for (const bloc of page.blocks ?? []) {
      const lignes: string[] = [];
      let ligneCourante = '';

      for (const paragraphe of bloc.paragraphs ?? []) {
        for (const mot of paragraphe.words ?? []) {
          const texteMot = (mot.symbols ?? []).map((s: any) => s.text).join('');
          ligneCourante += texteMot;

          const dernierSymbole = mot.symbols?.[mot.symbols.length - 1];
          const typeSaut = dernierSymbole?.property?.detectedBreak?.type;
          if (typeSaut === 'LINE_BREAK' || typeSaut === 'EOL_SURE_SPACE') {
            lignes.push(ligneCourante.trim());
            ligneCourante = '';
          } else if (typeSaut === 'SPACE') {
            ligneCourante += ' ';
          }
        }
        if (ligneCourante.trim()) {
          lignes.push(ligneCourante.trim());
          ligneCourante = '';
        }
      }

      const texte = lignes.filter(Boolean).join('\n').trim();
      if (texte) {
        blocs.push({ id: `bloc-${index}`, texte });
        index += 1;
      }
    }
  }

  return blocs;
}
