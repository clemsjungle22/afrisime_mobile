import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Retours tactiles discrets. Silencieux sur le web et si l'appareil ne les gère pas
 * (beaucoup d'Android d'entrée de gamme) : jamais d'erreur visible.
 */
const enabled = Platform.OS === 'ios' || Platform.OS === 'android';

export const haptics = {
  /** Toucher léger (sélection, ajout au panier). */
  tap(): void {
    if (enabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  },
  /** Choix dans une liste. */
  select(): void {
    if (enabled) void Haptics.selectionAsync().catch(() => undefined);
  },
  /** Réussite (commande confirmée, paiement reçu). */
  success(): void {
    if (enabled) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  },
  /** Erreur (paiement refusé). */
  error(): void {
    if (enabled) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
  },
};
