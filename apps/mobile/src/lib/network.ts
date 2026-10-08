import NetInfo, { useNetInfo } from '@react-native-community/netinfo';
import { focusManager, onlineManager } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';

let wired = false;
let focusWired = false;

/** Synchronise l'état réseau de TanStack Query avec NetInfo (refetch au retour du réseau). */
export function wireOnlineManager(): void {
  if (wired) return;
  wired = true;
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    }),
  );
}

/** true uniquement quand on SAIT qu'on est hors ligne (null = inconnu au démarrage). */
export function useIsOffline(): boolean {
  const { isConnected, isInternetReachable } = useNetInfo();
  return isConnected === false || isInternetReachable === false;
}

/**
 * Sur mobile, « fenêtre active » = app au premier plan. Branché sur AppState, cela permet aux requêtes
 * qui le demandent (refetchOnWindowFocus) de se rafraîchir au retour dans l'app (ex. suivi de commande).
 */
export function wireFocusManager(): void {
  if (focusWired || Platform.OS === 'web') return;
  focusWired = true;
  focusManager.setEventListener((setFocused) => {
    const sub = AppState.addEventListener('change', (state) => setFocused(state === 'active'));
    return () => sub.remove();
  });
}
