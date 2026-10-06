import { Alert } from 'react-native';

/** Action pas encore livrée : message clair plutôt qu'un bouton mort. */
export function comingSoon(feature: string): void {
  Alert.alert('Bientôt disponible', `${feature} arrive dans une prochaine version de l'app.`);
}
