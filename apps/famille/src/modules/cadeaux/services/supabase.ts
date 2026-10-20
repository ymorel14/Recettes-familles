// Client Supabase du module : même projet, même session que toute l'app
// Famille ; requêtes dans le schéma « wishlist », comme dans l'ancienne app.
import { clientPourSchema, schemaFamille, URL_RETOUR_EMAIL } from '../../../services/supabase';

export const supabase = clientPourSchema('wishlist');
export { schemaFamille, URL_RETOUR_EMAIL };
