import type { ProfileUpdateBody } from '@afrisime/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from './api';
import { useSession } from './session';

export const authKeys = {
  me: () => ['me'] as const,
  onboarding: () => ['onboarding', 'options'] as const,
};

/** Profil du client connecté (jamais persisté sur le téléphone : données personnelles). */
export function useMe() {
  const authenticated = useSession((s) => s.status === 'authenticated');
  return useQuery({
    queryKey: authKeys.me(),
    queryFn: ({ signal }) => authApi.getMe(signal),
    enabled: authenticated,
    staleTime: 5 * 60_000,
  });
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
