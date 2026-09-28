// Compte famille : code commun à toutes les apps, dans packages/famille.
import './supabase';
export {
  extraireMessageErreur,
  rejoindreAvecCode,
  creerFamille,
  creerFoyer,
  listerFoyersARejoindre,
  choisirFoyer,
  obtenirCodeInvitation,
  formaterExpiration,
  listerMesFamilles,
  choisirFamilleActive,
  quitterFamille,
  listerFoyersFamilleActive,
} from '@apps-famille/famille';
export type { ResultatCode, FoyerARejoindre, FamilleResume } from '@apps-famille/famille';
