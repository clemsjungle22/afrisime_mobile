import { mockProducts, packSeeds } from '@afrisime/fixtures';
import {
  Carnet,
  CarnetList,
  type Contribution,
  MAX_ACTIVE_CARNETS,
  PackList,
  carnetProgress,
  catalogValue,
  contributionError,
  dailyAmountOf,
  packItemsView,
} from '@afrisime/shared';
import type { CarnetsApi } from '@/features/carnets/api';
import { withAuth, withRetry } from '../client';
import { requireUser } from './authServer';
import { type MockCarnet, type MockContribution, loadDb, saveDb } from './db';
import { PAYMENT_CONFIRM_MS, PAYMENT_FAIL_MS } from './orderServer';
import { mockError, simulate } from './simulate';

/** Packs et carnets du mode démo : mêmes règles et mêmes délais de paiement simulé que le serveur. */

const DAY_MS = 86_400_000;
const PAYMENT_TTL_MS = 90_000;
const read = <T>(run: () => Promise<T>, signal?: AbortSignal) => withRetry(run, { canRetry: true, signal });

const HINTS = {
  mixx: 'Validez la demande Mixx by Yas reçue sur votre téléphone avec votre code secret.',
  flooz: 'Validez la demande Flooz reçue sur votre téléphone avec votre code secret.',
} as const;
const FAILURE = {
  failed: 'Solde insuffisant ou paiement refusé. Vérifiez votre compte puis réessayez.',
  expired: 'Délai de confirmation dépassé.',
} as const;

const packs = () =>
  packSeeds.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    imageUrl: null,
    items: packItemsView(p.items, mockProducts),
    price: p.price,
    durationDays: p.durationDays,
    dailyAmount: dailyAmountOf(p.price, p.durationDays),
    catalogValue: catalogValue(p.items, mockProducts),
  }));

/** Issue simulée d'une cotisation Mobile Money encore en attente (figée une fois atteinte). */
function settle(carnet: MockCarnet, now: number): boolean {
  let changed = false;
  for (const c of carnet.contributions) {
    if (c.status !== 'pending') continue;
    const elapsed = now - Date.parse(c.createdAt);
    const next =
      c.outcome === 'succeed' && elapsed >= PAYMENT_CONFIRM_MS
        ? 'succeeded'
        : c.outcome === 'fail' && elapsed >= PAYMENT_FAIL_MS
          ? 'failed'
          : now >= Date.parse(c.expiresAt ?? c.createdAt)
            ? 'expired'
            : null;
    if (!next) continue;
    c.status = next;
    c.settledAt = new Date(now).toISOString();
    c.failureReason = next === 'succeeded' ? null : FAILURE[next];
    if (next === 'succeeded') carnet.paid += c.amount;
    changed = true;
  }
  if (carnet.status === 'active' && carnet.paid >= carnet.price) {
    carnet.status = 'completed';
    carnet.completedAt = new Date(now).toISOString();
    changed = true;
  }
  return changed;
}

function toContribution(c: MockContribution): Contribution {
  return {
    id: c.id,
    amount: c.amount,
    method: c.method,
    status: c.status,
    createdAt: c.createdAt,
    settledAt: c.settledAt,
    agencyName: null,
    failureReason: c.failureReason,
    action:
      c.status === 'pending' && c.method !== 'cash'
        ? { type: 'confirm_on_phone', url: null, instructions: HINTS[c.method] }
        : null,
  };
}

function toCarnet(c: MockCarnet, now: number): Carnet {
  const progress = carnetProgress({ ...c, startedAt: new Date(c.startedAt) }, new Date(now));
  const contributions = [...c.contributions].reverse().map(toContribution);
  return {
    id: c.id,
    packId: c.packId,
    name: c.name,
    imageUrl: null,
    items: c.items,
    price: c.price,
    durationDays: c.durationDays,
    dailyAmount: c.dailyAmount,
    paid: c.paid,
    remaining: progress.remaining,
    status: c.status,
    startedAt: c.startedAt,
    dueAt: c.dueAt,
    completedAt: c.completedAt,
    expectedToDate: progress.expectedToDate,
    daysLate: progress.daysLate,
    pendingContribution: contributions.find((x) => x.status === 'pending') ?? null,
    contributions,
  };
}

/** Carnets du client connecté, cotisations en attente réglées ; `change` peut les modifier. */
async function withCarnets<T>(token: string | null, run: (carnets: MockCarnet[], now: number) => T) {
  const user = await requireUser(token);
  const db = await loadDb();
  const carnets = db.carnets[user.id] ?? [];
  const now = Date.now();
  carnets.forEach((c) => settle(c, now));
  const result = run(carnets, now);
  await saveDb({ ...db, carnets: { ...db.carnets, [user.id]: carnets } });
  return result;
}

/** Réponses déjà données par clé d'idempotence (rejouer la même clé = même résultat). */
const replies = new Map<string, string>();

export const mockCarnetsApi: CarnetsApi = {
  listPacks(signal) {
    return read(() => simulate(PackList, () => ({ items: packs() })), signal);
  },
  listCarnets(signal) {
    return read(
      () =>
        withAuth((token) =>
          simulate(CarnetList, () =>
            withCarnets(token, (carnets, now) => ({
              items: [...carnets]
                .sort((a, b) => Number(a.status !== 'active') - Number(b.status !== 'active') || b.startedAt.localeCompare(a.startedAt))
                .map((c) => toCarnet(c, now)),
            })),
          ),
        ),
      signal,
    );
  },
  getCarnet(carnetId, signal) {
    return read(
      () =>
        withAuth((token) =>
          simulate(Carnet, () =>
            withCarnets(token, (carnets, now) => {
              const c = carnets.find((x) => x.id === carnetId);
              if (!c) throw mockError('NOT_FOUND', 'Carnet introuvable.', 404);
              return toCarnet(c, now);
            }),
          ),
        ),
      signal,
    );
  },
  subscribe(packId, key) {
    return read(() =>
      withAuth((token) =>
        simulate(Carnet, () =>
          withCarnets(token, (carnets, now) => {
            const done = replies.get(key);
            const existing = done ? carnets.find((c) => c.id === done) : undefined;
            if (existing) return toCarnet(existing, now);
            const pack = packs().find((p) => p.id === packId);
            if (!pack) throw mockError('NOT_FOUND', 'Ce pack n’est plus proposé.', 404);
            if (carnets.filter((c) => c.status === 'active').length >= MAX_ACTIVE_CARNETS) {
              throw mockError('VALIDATION_ERROR', `${MAX_ACTIVE_CARNETS} carnets en cours au maximum : terminez-en un avant d’en ouvrir un autre.`, 422);
            }
            const carnet: MockCarnet = {
              id: `car_${now.toString(36)}`,
              packId: pack.id,
              name: pack.name,
              items: pack.items,
              price: pack.price,
              durationDays: pack.durationDays,
              dailyAmount: pack.dailyAmount,
              paid: 0,
              status: 'active',
              startedAt: new Date(now).toISOString(),
              dueAt: new Date(now + pack.durationDays * DAY_MS).toISOString(),
              completedAt: null,
              contributions: [],
            };
            carnets.push(carnet);
            replies.set(key, carnet.id);
            return toCarnet(carnet, now);
          }),
        ),
      ),
    );
  },
  contribute(carnetId, body, key) {
    return read(() =>
      withAuth((token) =>
        simulate(Carnet, () =>
          withCarnets(token, (carnets, now) => {
            const carnet = carnets.find((c) => c.id === carnetId);
            if (!carnet) throw mockError('NOT_FOUND', 'Carnet introuvable.', 404);
            if (replies.has(key) || carnet.contributions.some((c) => c.status === 'pending')) return toCarnet(carnet, now);
            if (carnet.status !== 'active') throw mockError('VALIDATION_ERROR', 'Ce carnet n’accepte plus de cotisation.', 422);
            const error = contributionError(body.amount, carnet.price - carnet.paid);
            if (error) throw mockError('VALIDATION_ERROR', error, 422);
            carnet.contributions.push({
              id: `cot_${now.toString(36)}`,
              amount: body.amount,
              method: body.method,
              status: 'pending',
              outcome: body.phone.endsWith('0002') ? 'fail' : body.phone.endsWith('0003') ? 'expire' : 'succeed',
              createdAt: new Date(now).toISOString(),
              expiresAt: new Date(now + PAYMENT_TTL_MS).toISOString(),
              settledAt: null,
              failureReason: null,
            });
            replies.set(key, carnet.id);
            return toCarnet(carnet, now);
          }),
        ),
      ),
    );
  },
};
