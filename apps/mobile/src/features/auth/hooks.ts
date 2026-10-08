import type { ProfileUpdateBody } from '@afrisime/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { authApi } from './api';
import { useSession } from './session';

export const authKeys = {
  me: () => ['me'] as const,
  onboarding: () => ['onboarding', 'options'] as const,
};

/** Vérification du profil pendant qu'une demande pro attend la validation de l'équipe. */
export const PENDING_PROFILE_POLL_MS = 60_000;

/**
 * Profil du client connecté (jamais persisté sur le téléphone : données personnelles).
 * Relu au retour dans l'app au-delà de 30 s ; chaque minute tant qu'un profil pro est en attente.
 */
export function useMe() {
  const authenticated = useSession((s) => s.status === 'authenticated');
  return useQuery({
    queryKey: authKeys.me(),
    queryFn: ({ signal }) => authApi.getMe(signal),
    enabled: authenticated,
    staleTime: 30_000,
    refetchInterval: (query) =>
      query.state.data?.customerTypePending ? PENDING_PROFILE_POLL_MS : false,
  });
}

/**
 * Tarif ou profil changé par l'équipe (profil pro validé, refusé…) : les prix affichés
 * (accueil, catalogue, fiches) sont rechargés pour refléter le nouveau tarif.
 */
export function useTariffChangeRefresh() {
  const client = useQueryClient();
  const { data } = useMe();
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!data) return;
    const key = `${data.segmentLabel}|${data.customerTypeId}|${data.customerTypePending}`;
    if (last.current !== null && last.current !== key) {
      void client.invalidateQueries({ predicate: (q) => q.queryKey[0] !== authKeys.me()[0] });
    }
    last.current = key;
  }, [data, client]);
}

/** Types de client, agences, CGU : listes paramétrables (RB-010). */
export function useOnboardingOptions() {
  return useQuery({
    queryKey: authKeys.onboarding(),
    queryFn: ({ signal }) => authApi.getOnboardingOptions(signal),
    staleTime: 60 * 60_000,
  });
}

export function useUpdateProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: ProfileUpdateBody) => authApi.updateMe(body),
    onSuccess: (user) => client.setQueryData(authKeys.me(), user),
  });
}
