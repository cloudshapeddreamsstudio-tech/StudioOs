import { describe, it, expect } from 'bun:test';
import { resolveCompany, requirePostingAccounts, resolveBrand } from '../src/lib/companyProfile';
import type { FrappeClient, ListOptions } from '../src/lib/frappe';

/**
 * The rule these pin is "do not guess which company".
 *
 * It is not theoretical. The development bench has two companies whose defaults
 * disagree — Global Defaults names one, the user's own default names the other,
 * and every invoice that exists belongs to the second. Picking either one
 * automatically would post new invoices into a different ledger from the
 * existing ones, splitting a studio's books with nothing on screen to show it.
 */

const CSDS = {
  name: 'Cloud Shaped Dreams Studio',
  abbr: 'CSDS',
  default_currency: 'INR',
  country: 'India',
  default_income_account: 'Sales - CSDS',
  default_receivable_account: 'Debtors - CSDS',
  cost_center: 'Main - CSDS',
};

const DEMO = {
  name: 'Cloud Shaped Dreams Studio (Demo)',
  abbr: 'CSDSD',
  default_currency: 'INR',
  country: 'India',
  default_income_account: 'Sales - CSDSD',
  default_receivable_account: 'Debtors - CSDSD',
  cost_center: 'Main - CSDSD',
};

/** A site with the given companies, and nothing else in it. */
function siteWith(companies: Record<string, unknown>[]): FrappeClient {
  return {
    async getList<T>(doctype: string, _opts: ListOptions = {}) {
      if (doctype === 'Company') return companies as T[];
      return [] as T[];
    },
  } as unknown as FrappeClient;
}

describe('resolveCompany', () => {
  it('uses the only company when there is one', async () => {
    const profile = await resolveCompany(siteWith([CSDS]));
    expect(profile.name).toBe('Cloud Shaped Dreams Studio');
    expect(profile.incomeAccount).toBe('Sales - CSDS');
    expect(profile.receivableAccount).toBe('Debtors - CSDS');
    expect(profile.costCenter).toBe('Main - CSDS');
  });

  it('uses the named company when the document already says which', async () => {
    const profile = await resolveCompany(siteWith([CSDS, DEMO]), DEMO.name);
    expect(profile.abbr).toBe('CSDSD');
    expect(profile.receivableAccount).toBe('Debtors - CSDSD');
  });

  /** The one that matters. Two ledgers, no basis for choosing: refuse. */
  it('refuses to pick between several companies', async () => {
    const attempt = resolveCompany(siteWith([CSDS, DEMO]));
    await expect(attempt).rejects.toThrow('more than one company');
  });

  it('refuses a company the site does not have, rather than falling back', async () => {
    const attempt = resolveCompany(siteWith([CSDS]), 'Someone Else Films');
    await expect(attempt).rejects.toThrow('no company called "Someone Else Films"');
  });

  it('says so when the site has no company at all', async () => {
    await expect(resolveCompany(siteWith([]))).rejects.toThrow('no Company set up');
  });
});

describe('requirePostingAccounts', () => {
  it('returns all three when they are set', () => {
    const accounts = requirePostingAccounts({
      name: 'X',
      abbr: 'X',
      currency: 'INR',
      country: 'India',
      incomeAccount: 'Sales - X',
      receivableAccount: 'Debtors - X',
      costCenter: 'Main - X',
    });
    expect(accounts.incomeAccount).toBe('Sales - X');
  });

  /**
   * An invoice posted to a guessed account is worse than an invoice that was
   * not created, so this names what is missing instead of substituting one.
   */
  it('refuses, naming what the Company is missing', () => {
    expect(() =>
      requirePostingAccounts({
        name: 'Moonlight Films',
        abbr: 'MF',
        currency: 'INR',
        country: 'India',
        incomeAccount: null,
        receivableAccount: 'Debtors - MF',
        costCenter: null,
      }),
    ).toThrow('Moonlight Films has no default income account, no default cost centre');
  });
});

describe('resolveBrand', () => {
  it('takes the company name from ERPNext rather than from a stored default', async () => {
    const brand = await resolveBrand(siteWith([CSDS]));
    expect(brand.companyName).toBe('Cloud Shaped Dreams Studio');
    expect(brand.footerText).toBe('Cloud Shaped Dreams Studio');
  });

  /**
   * No ERPNext field holds a UPI id. An empty one means `buildPayQr` returns
   * nothing and the invoice simply does not offer Scan-to-Pay, rather than
   * printing a QR that resolves to someone else's account — which is what
   * would have happened while every studio inherited CSDS's stored brand row.
   */
  it('leaves the UPI id empty, so no Scan-to-Pay QR is claimed', async () => {
    const brand = await resolveBrand(siteWith([CSDS]));
    expect(brand.upiId).toBe('');
  });

  it('leaves bank details empty when the company has no bank account', async () => {
    const brand = await resolveBrand(siteWith([CSDS]));
    expect(brand.bank.accountNo).toBe('');
    expect(brand.bank.accountName).toBe('');
  });
});
