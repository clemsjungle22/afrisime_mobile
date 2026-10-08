import { type AdminDashboard, FINAL_ORDER_STATUSES } from '@afrisime/shared';
import { and, asc, count, eq, gte, notInArray, sql, sum } from 'drizzle-orm';
import type { Db } from '../db/client';
import * as s from '../db/schema';

const FINAL = [...FINAL_ORDER_STATUSES];

/** Chiffres du jour (journée UTC = heure de Lomé) et points d'attention. */
export async function getDashboard(db: Db, now = new Date()): Promise<AdminDashboard> {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const sellable = sql<number>`sum(${s.stockLevels.onHand} - ${s.stockLevels.reserved})::int`;
  const threshold = sql<number>`max(${s.stockLevels.lowThreshold})::int`;

  const [[created], [paid], open, low, [pending]] = await Promise.all([
    db.select({ n: count() }).from(s.orders).where(gte(s.orders.createdAt, day)),
    db
      .select({ n: count(), total: sum(s.orders.total) })
      .from(s.orders)
      .where(and(eq(s.orders.paymentStatus, 'succeeded'), gte(s.orders.paidAt, day))),
    db
      .select({ status: s.orders.status, n: count() })
      .from(s.orders)
      .where(notInArray(s.orders.status, FINAL))
      .groupBy(s.orders.status),
    db
      .select({
        variantId: s.productVariants.id,
        productName: s.products.name,
        variantLabel: s.productVariants.label,
        sellable,
        threshold,
      })
      .from(s.stockLevels)
      .innerJoin(s.productVariants, eq(s.productVariants.id, s.stockLevels.variantId))
      .innerJoin(s.products, eq(s.products.id, s.productVariants.productId))
      .where(
        and(
          eq(s.productVariants.isActive, true),
          eq(s.products.isActive, true),
          eq(s.productVariants.saleMode, 'standard'),
        ),
      )
      .groupBy(s.productVariants.id, s.products.name, s.productVariants.label)
      .having(sql`${sellable} <= ${threshold}`)
      .orderBy(asc(sellable))
      .limit(20),
    db.select({ n: count() }).from(s.customers).where(eq(s.customers.customerTypePending, true)),
  ]);

  return {
    day: day.toISOString(),
    ordersToday: created?.n ?? 0,
    revenueToday: Number(paid?.total ?? 0),
    paidOrdersToday: paid?.n ?? 0,
    openByStatus: open.map((o) => ({ status: o.status, count: o.n })),
    lowStock: low.map((l) => ({
      ...l,
      sellable: Number(l.sellable),
      threshold: Number(l.threshold),
    })),
    pendingProAccounts: pending?.n ?? 0,
  };
}
