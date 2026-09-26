import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { brand as brandTable } from '../db/schema';
import type { AppEnv, Env } from '../types';

/**
 * Brand/customisation config for the studio's invoices.
 *
 * The *data* on an invoice lives in ERPNext, but how it *looks* -- logo, accent
 * colour, address, bank block, Scan-to-Pay QR, footer -- is presentation the
 * studio owns. Ported from `server/routes/brand.js` (brand.json) to D1.
 *
 * The stored row is flat (SQLite has no nested objects) but the renderer and
 * the invoice designer both expect the original nested `address` / `bank`
 * shape, so this module maps between the two. That keeps the API contract
 * byte-identical to the old app.
 */

// Moved to schemas/brand.ts in Phase 6a — see the note there for why.
// Re-exported so every existing importer of this module still works.
export type { BrandConfig } from '../schemas/brand';
import type { BrandConfig } from '../schemas/brand';

/** Shape used when nothing has been saved yet, so the renderer never breaks. */
export const BRAND_DEFAULTS: BrandConfig = {
  companyName: 'Cloud Shaped Dreams Studio',
  tagline: 'STUDIO',
  logoPath: '',
  accentColor: '#3d7fa6',
  address: { line1: '', line2: '', line3: '', country: 'India' },
  phone: '',
  email: '',
  bank: { accountName: '', bankName: '', accountNo: '', branch: '', ifsc: '', pan: '' },
  upiId: '',
  showQr: true,
  showBankDetails: true,
  notesTitle: 'Notes',
  notes: 'Thanks for your business.',
  footerText: 'Cloud Shaped Dreams Studio',
};

type BrandRow = typeof brandTable.$inferSelect;

function rowToConfig(row: BrandRow): BrandConfig {
  return {
    companyName: row.companyName || BRAND_DEFAULTS.companyName,
    tagline: row.tagline,
    logoPath: row.logoPath,
    accentColor: row.accentColor,
    address: {
      line1: row.addressLine1,
      line2: row.addressLine2,
      line3: row.addressLine3,
      country: row.addressCountry,
    },
    phone: row.phone,
    email: row.email,
    bank: {
      accountName: row.bankAccountName,
      bankName: row.bankName,
      accountNo: row.bankAccountNo,
      branch: row.bankBranch,
      ifsc: row.bankIfsc,
      pan: row.bankPan,
    },
    upiId: row.upiId,
    showQr: row.showQr,
    showBankDetails: row.showBankDetails,
    notesTitle: row.notesTitle,
    notes: row.notes,
    footerText: row.footerText,
  };
}

function configToRow(cfg: BrandConfig): BrandRow {
  return {
    id: 1,
    companyName: cfg.companyName,
    tagline: cfg.tagline,
    logoPath: cfg.logoPath,
    accentColor: cfg.accentColor,
    addressLine1: cfg.address.line1,
    addressLine2: cfg.address.line2,
    addressLine3: cfg.address.line3,
    addressCountry: cfg.address.country,
    phone: cfg.phone,
    email: cfg.email,
    bankAccountName: cfg.bank.accountName,
    bankName: cfg.bank.bankName,
    bankAccountNo: cfg.bank.accountNo,
    bankBranch: cfg.bank.branch,
    bankIfsc: cfg.bank.ifsc,
    bankPan: cfg.bank.pan,
    upiId: cfg.upiId,
    showQr: cfg.showQr,
    showBankDetails: cfg.showBankDetails,
    notesTitle: cfg.notesTitle,
    notes: cfg.notes,
    footerText: cfg.footerText,
  };
}

/** Reads the single brand row, falling back to defaults if nothing is stored. */
export async function readBrand(env: Env): Promise<BrandConfig> {
  const rows = await db(env).select().from(brandTable).where(eq(brandTable.id, 1));
  const row = rows[0];
  return row ? rowToConfig(row) : { ...BRAND_DEFAULTS };
}

const app = new Hono<AppEnv>();

/** GET /api/brand -- current config, used by the designer and the renderer. */
app.get('/', async (c) => c.json(await readBrand(c.env)));

/**
 * PUT /api/brand -- save config. Accepts a partial object and shallow-merges it
 * over what's stored, with `address` and `bank` merged one level deep. The logo
 * arrives as a data: URL inside `logoPath`, so there is no file upload to
 * manage.
 */
app.put('/', async (c) => {
  const incoming = (await c.req.json()) as Partial<BrandConfig>;
  const current = await readBrand(c.env);

  const merged: BrandConfig = {
    ...current,
    ...incoming,
    address: { ...current.address, ...(incoming.address ?? {}) },
    bank: { ...current.bank, ...(incoming.bank ?? {}) },
  };

  await db(c.env)
    .insert(brandTable)
    .values(configToRow(merged))
    .onConflictDoUpdate({ target: brandTable.id, set: configToRow(merged) });

  return c.json(merged);
});

export default app;
