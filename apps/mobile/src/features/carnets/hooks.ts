import type { Carnet, ContributeBody } from '@afrisime/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { newIdempotencyKey } from '@/api/client';
import { useSession } from '@/features/auth/session';
import { carnetsApi } from './api';

export const carnetsKeys = {
  packs: ['packs'] as const,
  carnets: ['carnets'] as const,
  carnet: (id: string) => ['carnets', 'detail', id] as const,
};

/** Cotisation Mobile Money en attente : relue souvent jusqu'à la réponse de l'opérateur. */
const PENDING_POLL_MS = 3_000;

export function usePacks() {
  return useQuery({
    queryKey: carnetsKeys.packs,
    queryFn: ({ signal }) => carnetsApi.listPacks(signal),
    staleTime: 5 * 60_000,
  });
}

export function useCarnets() {
  const authenticated = useSession((s) => s.status === 'authenticated');
  return useQuery({
    queryKey: carnetsKeys.carnets,
    queryFn: ({ signal }) => carnetsApi.listCarnets(signal),
    enabled: authenticated,
    staleTime: 30_000,
    refetchInterval: (q) => (q.state.data?.items.some((c) => c.pendingContribution) ? PENDING_POLL_MS : false),
  });
}

export function useCarnet(carnetId: string) {
  return useQuery({
    queryKey: carnetsKeys.carnet(carnetId),
    queryFn: ({ signal }) => carnetsApi.getCarnet(carnetId, signal),
    staleTime: 10_000,
    refetchInterval: (q) => (q.state.data?.pendingContribution ? PENDING_POLL_MS : false),
  });
}

function useStore() {
  const client = useQueryClient();
  return (carnet: Carnet) => {
    client.setQueryData(carnetsKeys.carnet(carnet.id), carnet);
    void client.invalidateQueries({ queryKey: carnetsKeys.carnets, exact: true });
  };
}

/**
 * Souscrire : une clé d'idempotence par intention, gardée tant que la souscription n'a pas abouti
 * (un nouvel essai après coupure réseau ne crée jamais un second carnet).
 */
export function useSubscribe() {
  const store = useStore();
  const key = useRef<{ packId: string; key: string } | null>(null);
  return useMutation({
    mutationFn: (packId: string) => {
      if (key.current?.packId !== packId) key.current = { packId, key: newIdempotencyKey() };
      return carnetsApi.subscribe(packId, key.current.key);
    },
    onSuccess: (carnet) => {
      key.current = null;
      store(carnet);
    },
  });
}

/**
 * Cotiser : même clé pour renvoyer la MÊME demande ; un autre montant, opérateur ou numéro = autre demande
 * (le serveur renvoie de toute façon une demande encore en cours : jamais deux débits).
 */
export function useContribute(carnetId: string) {
  const store = useStore();
  const key = useRef<{ signature: string; key: string } | null>(null);
  return useMutation({
    mutationFn: (body: ContributeBody) => {
      const signature = `${body.amount}|${body.method}|${body.phone}`;
      if (key.current?.signature !== signature) key.current = { signature, key: newIdempotencyKey() };
      return carnetsApi.contribute(carnetId, body, key.current.key);
    },
    onSuccess: (carnet) => {
      key.current = null;
      store(carnet);
    },
  });
}
