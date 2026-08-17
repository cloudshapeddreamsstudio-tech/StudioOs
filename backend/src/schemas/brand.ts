/**
 * Invoice branding, as a type only.
 *
 * This lived in `routes/brand.ts` until Phase 6a. Two lib modules —
 * `invoiceHtml.ts` and `payQr.ts` — imported it from there, which meant a
 * renderer depended on a route, and through it on the database client. That
 * layering was backwards, and it became load-bearing once the D1 binding was
 * removed: excluding the route from type-checking could not work while two
 * included files still reached into it.
 *
 * The type belongs with the other schemas. `routes/brand.ts` re-exports it so
 * existing importers are unaffected.
 */
export interface BrandConfig {
  companyName: string;
  tagline: string;
  logoPath: string;
  accentColor: string;
  address: { line1: string; line2: string; line3: string; country: string };
  phone: string;
  email: string;
  bank: {
    accountName: string;
    bankName: string;
    accountNo: string;
    branch: string;
    ifsc: string;
    pan: string;
  };
  upiId: string;
  showQr: boolean;
  showBankDetails: boolean;
  notesTitle: string;
  notes: string;
  footerText: string;
}
