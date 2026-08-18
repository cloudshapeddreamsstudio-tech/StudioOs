import { ValidationError } from './errors';
import { getListTolerant } from './optionalFields';
import type { FrappeClient } from './frappe';
import type { BrandConfig } from '../schemas/brand';

/**
 * Who this studio is, and where its money posts — asked of the studio's own
 * ERPNext rather than written down here.
 *
 * The old app hardcoded `Sales - CSDS`, `Debtors - CSDS` and `Main - CSDS`,
 * taken from CSDS's existing invoices. Correct for one studio and wrong for
 * every other — and wrong *silently*, because those accounts simply do not
 * exist on another site, so the first invoice a second customer raised would
 * fail with an ERPNext error about an account nobody had heard of.
 *
 * All three are already on the `Company` doctype as
 * `default_income_account`, `default_receivable_account` and `cost_center`.
 * They are answers ERPNext will give if asked.
 *
 * ## Which company, when a site has more than one
 *
 * This is not hypothetical. The development bench has two — "Cloud Shaped
 * Dreams Studio" and "Cloud Shaped Dreams Studio (Demo)" — and they disagree
 * with each other in a way that matters:
 *
 *   Global Defaults default_company : Cloud Shaped Dreams Studio  (Debtors - CSDS)
 *   the user's own default          : Cloud Shaped Dreams Studio (Demo)
 *   every invoice that exists        : Cloud Shaped Dreams Studio (Demo)
 *
 * Resolving from Global Defaults would have posted new invoices to one ledger
 * while every existing invoice sat in another, splitting the studio's books in
 * two with nothing on screen to show it. So this **does not guess**: naming the
 * company explicitly always wins, one company on the site is unambiguous, and
 * anything else is refused with the choices listed. A refusal is recoverable;
 * a wrong ledger is found at audit.
 */

export interface CompanyProfile {
  name: string;
  abbr: string;
  currency: string;
  country: string;
  /** Nulls are real: a company can exist without its defaults filled in. */
  incomeAccount: string | null;
  receivableAccount: string | null;
  costCenter: string | null;
}

interface CompanyRow {
  name: string;
  abbr?: string | null;
  default_currency?: string | null;
  country?: string | null;
  default_income_account?: string | null;
  default_receivable_account?: string | null;
  cost_center?: string | null;
  company_logo?: string | null;
  phone_no?: string | null;
  email?: string | null;
  tax_id?: string | null;
}

const COMPANY_FIELDS = [
  'name',
  'abbr',
  'default_currency',
  'country',
  'default_income_account',
  'default_receivable_account',
  'cost_center',
  'company_logo',
  'phone_no',
  'email',
  'tax_id',
];

async function listCompanies(frappe: FrappeClient): Promise<CompanyRow[]> {
  const { rows } = await getListTolerant<CompanyRow>(frappe, 'Company', {
    fields: COMPANY_FIELDS,
    limit: 50,
    orderBy: 'name asc',
  });
  return rows;
}

/**
 * The company row to work from.
 *
 * @param preferred the company already stamped on the document being handled.
 *   Printing an existing invoice knows its own company exactly, so nothing has
 *   to be inferred on that path at all.
 */
async function resolveCompanyRow(
  frappe: FrappeClient,
  preferred?: string | null,
): Promise<CompanyRow> {
  const companies = await listCompanies(frappe);

  if (!companies.length) {
    throw new ValidationError('This ERPNext site has no Company set up yet.');
  }

  if (preferred) {
    const match = companies.find((c) => c.name === preferred);
    if (match) return match;
    throw new ValidationError(
      `This ERPNext site has no company called "${preferred}".`,
      { companies: companies.map((c) => c.name) },
    );
  }

  const only = companies[0];
  if (companies.length === 1 && only) return only;

  throw new ValidationError(
    'Your ERPNext has more than one company, so StudioOS cannot tell which books this belongs in. Say which company to use.',
    { companies: companies.map((c) => c.name) },
  );
}

export async function resolveCompany(
  frappe: FrappeClient,
  preferred?: string | null,
): Promise<CompanyProfile> {
  const row = await resolveCompanyRow(frappe, preferred);
  return {
    name: row.name,
    abbr: row.abbr || '',
    currency: row.default_currency || 'INR',
    country: row.country || '',
    incomeAccount: row.default_income_account || null,
    receivableAccount: row.default_receivable_account || null,
    costCenter: row.cost_center || null,
  };
}

/**
 * The accounting coordinates a write needs, or a refusal naming what is
 * missing.
 *
 * Posting an invoice without an income account is not something to paper over
 * with a guess — the studio's chart of accounts is theirs, and an invoice filed
 * against the wrong one is worse than an invoice that was not created.
 */
export function requirePostingAccounts(profile: CompanyProfile): {
  incomeAccount: string;
  receivableAccount: string;
  costCenter: string;
} {
  const missing: string[] = [];
  if (!profile.incomeAccount) missing.push('default income account');
  if (!profile.receivableAccount) missing.push('default receivable account');
  if (!profile.costCenter) missing.push('default cost centre');

  if (missing.length) {
    throw new ValidationError(
      `${profile.name} has no ${missing.join(', no ')} set in ERPNext, so StudioOS does not know which accounts to post to. Set them on the Company record.`,
    );
  }

  return {
    incomeAccount: profile.incomeAccount as string,
    receivableAccount: profile.receivableAccount as string,
    costCenter: profile.costCenter as string,
  };
}

/**
 * Presentation the studio owns but has nowhere to keep yet.
 *
 * Everything above comes from ERPNext. These do not exist there: an accent
 * colour, a tagline and the wording of the notes block are the studio's taste,
 * and there is no doctype for taste. They fall back to something neutral until
 * Phase 10f decides where studio-owned presentation lives, at which point the
 * invoice designer can edit them again.
 *
 * `companyName` deliberately is **not** here — that comes from the Company.
 */
const COSMETIC_DEFAULTS = {
  tagline: '',
  accentColor: '#3d7fa6',
  notesTitle: 'Notes',
  notes: 'Thanks for your business.',
} as const;

interface AddressRow {
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  country?: string | null;
}

interface BankAccountRow {
  account_name?: string | null;
  bank?: string | null;
  bank_account_no?: string | null;
  branch_code?: string | null;
  iban?: string | null;
}

/**
 * The company's own Address, via the Dynamic Link child table ERPNext uses to
 * attach addresses to anything. Null when there is none, which is common.
 */
async function companyAddress(frappe: FrappeClient, company: string): Promise<AddressRow | null> {
  return frappe
    .getList<AddressRow>('Address', {
      fields: ['address_line1', 'address_line2', 'city', 'state', 'pincode', 'country'],
      filters: [
        ['Dynamic Link', 'link_doctype', '=', 'Company'],
        ['Dynamic Link', 'link_name', '=', company],
      ],
      limit: 1,
    })
    .then((rows) => rows[0] ?? null)
    .catch(() => null);
}

async function companyBankAccount(
  frappe: FrappeClient,
  company: string,
): Promise<BankAccountRow | null> {
  return getListTolerant<BankAccountRow>(frappe, 'Bank Account', {
    fields: ['account_name', 'bank', 'bank_account_no', 'branch_code', 'iban'],
    filters: [
      ['company', '=', company],
      ['is_company_account', '=', 1],
    ],
    limit: 1,
  })
    .then((r) => r.rows[0] ?? null)
    .catch(() => null);
}

/**
 * The invoice's branding, resolved from the studio's own ERPNext.
 *
 * Replaces `readBrand`, which read a D1 row seeded from CSDS's `brand.json` —
 * so every studio's invoice would have carried CSDS's address and bank details.
 *
 * What is genuinely absent stays absent rather than being invented:
 *
 *  - **No UPI id anywhere in ERPNext.** `upiId` is therefore empty and the
 *    Scan-to-Pay QR does not render. It is not drawn wrong or drawn blank; the
 *    invoice simply does not claim you can scan it. This is the clearest single
 *    item for Phase 10f.
 *  - **No bank account** on the company means the bank block is suppressed by
 *    the renderer, which already checks before drawing it.
 *  - `branch_code` is the field ERPNext uses for an Indian IFSC, and `tax_id`
 *    stands in for PAN. Both are best-effort mappings and are left blank rather
 *    than guessed when empty.
 */
export async function resolveBrand(
  frappe: FrappeClient,
  company?: string | null,
): Promise<BrandConfig> {
  const row = await resolveCompanyRow(frappe, company);
  const [address, bank] = await Promise.all([
    companyAddress(frappe, row.name),
    companyBankAccount(frappe, row.name),
  ]);

  return {
    companyName: row.name,
    tagline: COSMETIC_DEFAULTS.tagline,
    logoPath: row.company_logo || '',
    accentColor: COSMETIC_DEFAULTS.accentColor,
    address: {
      line1: address?.address_line1 || '',
      line2: address?.address_line2 || '',
      line3: [address?.city, address?.state, address?.pincode].filter(Boolean).join(' '),
      country: address?.country || row.country || '',
    },
    phone: row.phone_no || '',
    email: row.email || '',
    bank: {
      accountName: bank?.account_name || '',
      bankName: bank?.bank || '',
      accountNo: bank?.bank_account_no || bank?.iban || '',
      branch: '',
      ifsc: bank?.branch_code || '',
      pan: row.tax_id || '',
    },
    // No ERPNext field holds a UPI id, so there is nothing honest to put here.
    upiId: '',
    showQr: true,
    showBankDetails: true,
    notesTitle: COSMETIC_DEFAULTS.notesTitle,
    notes: COSMETIC_DEFAULTS.notes,
    footerText: row.name,
  };
}
