import type { CreditAccount, CreditRequestBody, RepayBody } from '@afrisime/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { newIdempotencyKey } from '@/api/client';
import { useSession } from '@/features/auth/session';
import { creditApi } from './api';

export const creditKeys = { account: ['credit'] as const };

/** Remboursement Mobile Money en attente : relu souvent jusqu'à la réponse de l'opérateur. */
const PENDING_POLL_MS = 3_000;

export function useCreditAccount() {
  const authenticated = useSession((s) => s.status === 'authenticated');
  return useQuery({
    queryKey: creditKeys.account,
    queryFn: ({ signal }) => creditApi.getAccount(signal),
    enabled: authenticated,
    staleTime: 30_000,
    refetchInterval: (q) => (q.state.data?.pendingRepayment ? PENDING_POLL_MS : false),
  });
}

function useStore() {
  const client = useQueryClient();
  return (account: CreditAccount) => client.setQueryData(creditKeys.account, account);
}

export function useRequestCredit() {
  const store = useStore();
  return useMutation({ mutationFn: (body: CreditRequestBody) => creditApi.request(body), onSuccess: store });
}

/**
 * Rembourser : même clé pour renvoyer la MÊME demande ; un autre montant, opérateur ou numéro = autre demande
 * (le serveur renvoie de toute façon une demande encore en cours : jamais deux débits).
 */
export function useRepay() {
  const store = useStore();
  const key = useRef<{ signature: string; key: string } | null>(null);
  return useMutation({
    mutationFn: (body: RepayBody) => {
      const signature = `${body.amount}|${body.method}|${body.phone}`;
      if (key.current?.signature !== signature) key.current = { signature, key: newIdempotencyKey() };
      return creditApi.repay(body, key.current.key);
    },
    onSuccess: (account) => {
      key.current = null;
      store(account);
    },
  });
}
