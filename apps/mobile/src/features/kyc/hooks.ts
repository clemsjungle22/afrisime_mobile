import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/features/auth/session';
import { type KycSubmission, kycApi } from './api';

export const kycKeys = { state: ['kyc'] as const };

/** Dossier en cours de vérification : relu de temps en temps pour voir la réponse de l'équipe. */
const PENDING_POLL_MS = 30_000;

export function useKyc() {
  const authenticated = useSession((s) => s.status === 'authenticated');
  return useQuery({
    queryKey: kycKeys.state,
    queryFn: ({ signal }) => kycApi.get(signal),
    enabled: authenticated,
    staleTime: 30_000,
    refetchInterval: (q) => (q.state.data?.status === 'pending' ? PENDING_POLL_MS : false),
  });
}

export function useSubmitKyc() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: KycSubmission) => kycApi.submit(input),
    onSuccess: (state) => client.setQueryData(kycKeys.state, state),
  });
}
