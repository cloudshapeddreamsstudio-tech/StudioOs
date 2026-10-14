import { describe, it, expect } from 'bun:test';
import { Hono } from 'hono';
import {
  computeFinance,
  buildExpenseOverview,
  readSanctionedAmount,
} from '../src/lib/projectFinance';
import projectDetail from '../src/routes/projectDetail';
import { errorHandler } from '../src/middleware/errorHandler';
import { FrappeError } from '../src/lib/errors';
import type { FrappeClient } from '../src/lib/frappe';
import type { AppEnv } from '../src/types';

/**
 * ADR-0005 condition 5, for money: when the sanctioned amount is not there,
 * StudioOS says "not available". It never shows 0, and it never calculates
 * from 0.
 *
 * Before this, `Number(project.custom_sanction_amount || 0)` made a site with
 * no such field, and a project with no budget typed in, both read as a budget
 * of ₹0. The Money tab then showed "Sanctioned ₹0" and a remaining budget
 * below zero: a number that looks correct and is not.
 */

describe('readSanctionedAmount', () => {
  it('is null when the site has no such field (the key is absent)', () => {
    expect(readSanctionedAmount({ name: 'PROJ-1' })).toBeNull();
  });

  it('is null when no budget is typed in', () => {
    // ERPNext stores an empty Currency field as 0. A budget is never 0, so 0
    // here means "not set", not "nothing to spend".
    expect(readSanctionedAmount({ custom_sanction_amount: 0 })).toBeNull();
    expect(readSanctionedAmount({ custom_sanction_amount: null })).toBeNull();
    expect(readSanctionedAmount({ custom_sanction_amount: '' })).toBeNull();
  });

  it('is the amount when one is set', () => {
    expect(readSanctionedAmount({ custom_sanction_amount: 100000 })).toBe(100000);
    expect(readSanctionedAmount({ custom_sanction_amount: '75000.50' })).toBe(75000.5);
  });
});

const base = {
  billed: 0,
  purchaseCost: 20000,
  liveSales: [],
  livePurchases: [],
  expenseTotal: 5000,
  grossMargin: 0,
  marginPercent: 0,
};

describe('computeFinance with no sanctioned amount', () => {
  const f = computeFinance({ ...base, sanctioned: null });

  it('reports the sanctioned amount as not available, not 0', () => {
    expect(f.sanctioned).toBeNull();
  });

  it('does not calculate a remaining budget from 0', () => {
    // 0 - 20000 - 5000 would read as "₹25,000 over budget".
    expect(f.remaining).toBeNull();
  });

  it('is unchanged when the amount is there', () => {
    const ok = computeFinance({ ...base, sanctioned: 100000 });
    expect(ok.sanctioned).toBe(100000);
    expect(ok.remaining).toBe(75000);
  });
});

describe('buildExpenseOverview with no sanctioned amount', () => {
  const overview = buildExpenseOverview({
    sanctioned: null,
    livePurchases: [],
    vendorPurchases: [],
    crewEntries: [],
    vendorEntries: [],
    expenses: [],
  });

  it('leaves each figure that is measured against the sanctioned amount as null', () => {
    const m = overview.margin;
    expect(m.productionCeiling).toBeNull();
    expect(m.profitPlanned).toBeNull();
    expect(m.profitActual).toBeNull();
    expect(m.profitActualPercent).toBeNull();
    expect(m.meetsTargetActual).toBeNull();
  });

  it('still totals the spend, which does not depend on the sanctioned amount', () => {
    expect(overview.actualTotal).toBe(0);
    expect(overview.plannedTotal).toBe(0);
  });
});

/* ------------------------------------------------------------- the route */

function siteWith(project: Record<string, unknown>): FrappeClient {
  const client: Partial<FrappeClient> = {
    getDoc: async <T>(doctype: string, name: string) => {
      if (doctype === 'Project' && name === project.name) return project as T;
      throw new FrappeError(404, { exception: 'DoesNotExistError' });
    },
    getList: async <T>() => [] as T[],
  };
  return client as FrappeClient;
}

async function finance(project: Record<string, unknown>) {
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('frappe', siteWith(project));
    await next();
  });
  app.onError(errorHandler);
  app.route('/', projectDetail);
  const res = await app.request(`/${String(project.name)}`);
  expect(res.status).toBe(200);
  return ((await res.json()) as { finance: Record<string, unknown> }).finance;
}

describe('GET /api/project/:name, the Money figures', () => {
  it('says not available on a site that has no sanctioned-amount field', async () => {
    const f = await finance({ name: 'PROJ-1', status: 'Open', total_purchase_cost: 20000 });
    expect(f.sanctioned).toBeNull();
    expect(f.remaining).toBeNull();
    // The stock fields are still read.
    expect(f.purchaseCost).toBe(20000);
  });

  it('says not available for a project with no budget typed in', async () => {
    const f = await finance({
      name: 'PROJ-2',
      status: 'Open',
      custom_sanction_amount: 0,
    });
    expect(f.sanctioned).toBeNull();
    expect(f.remaining).toBeNull();
  });

  it('gives the amount for a project that has one', async () => {
    const f = await finance({
      name: 'PROJ-3',
      status: 'Open',
      custom_sanction_amount: 100000,
      total_purchase_cost: 20000,
    });
    expect(f.sanctioned).toBe(100000);
    // No commission is reported: ADR-0005 does not permit its fields.
    expect('commissionOwed' in f).toBe(false);
  });
});
