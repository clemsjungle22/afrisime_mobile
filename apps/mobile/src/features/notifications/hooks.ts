import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/features/auth/session';
import { notificationsApi } from './api';

export const notificationsKeys = { all: ['notifications'] as const };

/** Relue chaque minute (et au retour sur l'app) : la pastille de la cloche reste à jour. */
const POLL_MS = 60_000;

export function useNotifications() {
  const authenticated = useSession((s) => s.status === 'authenticated');
  return useQuery({
    queryKey: notificationsKeys.all,
    queryFn: ({ signal }) => notificationsApi.list(signal),
    enabled: authenticated,
    staleTime: 15_000,
    refetchInterval: POLL_MS,
  });
}

export function useMarkNotificationsRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => notificationsApi.markRead(ids),
    onSuccess: (list) => client.setQueryData(notificationsKeys.all, list),
  });
}
