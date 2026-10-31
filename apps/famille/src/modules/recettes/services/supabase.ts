// Client Supabase du module : même projet, même session que toute l'app
// Famille ; requêtes dans le schéma « recettes », comme dans l'ancienne app.
import { clientPourSchema, schemaFamille, URL_RETOUR_EMAIL } from '../../../services/supabase';

export const supabase = clientPourSchema('recettes');
export { schemaFamille, URL_RETOUR_EMAIL };
// Espace de stockage des photos de recettes (inchangé).
export const BUCKET_PHOTOS_RECETTES = 'recettes-photos';
