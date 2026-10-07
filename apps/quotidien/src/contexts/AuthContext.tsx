// Session, famille active et foyer : code commun à toutes les apps, dans
// packages/famille. L'import de services/supabase garantit que le client de
// l'app est confié au paquet (configurerFamille) avant le premier usage.
import '../services/supabase';
export { AuthProvider, useAuth } from '@apps-famille/famille';
