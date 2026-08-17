import type { BrandConfig } from '../schemas/brand';

/**
 * Renders an ERPNext Sales Invoice into the studio's branded, print-ready HTML
 * (modelled on their Zoho invoice: accent header, logo + address block, subject
 * line, itemised table, totals, "total in words", bank details, a Scan-to-Pay
 * QR, and their own footer).
 *
 * Pure presentation: takes the invoice DATA (from ERPNext) and the BRAND config
 * (from D1) and produces a self-contained HTML string with inline CSS -- no
 * external requests, so it prints identically offline.
 *
 * Direct port of `server/lib/invoiceHtml.js`. Markup and CSS are unchanged so
 * printed invoices are byte-for-byte what the studio's clients already receive.
 */

export interface InvoiceItem {
  item_name?: string;
  item_code?: string;
  description?: string;
  qty?: number;
  rate?: number;
  amount?: number;
}

export interface InvoiceDoc {
  name?: string;
  custom_invoice_number?: string;
  customer?: string;
  customer_name?: string;
  project?: string;
  posting_date?: string;
  due_date?: string;
  payment_terms_template?: string;
  remarks?: string;
  docstatus?: number;
  total?: number;
  discount_amount?: number;
  grand_total?: number;
  outstanding_amount?: number | null;
  in_words?: string;
  items?: InvoiceItem[];
}

function esc(str: unknown): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return String(str ?? '').replace(/[&<>"']/g, (c) => map[c] ?? c);
}

function inr(n: unknown): string {
  return (
    '₹' +
    Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

function num(n: unknown): string {
  return Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

function fmtDate(value: string | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB'); // dd/mm/yyyy, matching the reference
}

export function renderInvoiceHtml(
  invoice: InvoiceDoc,
  brand: BrandConfig,
  qrDataUrl: string,
): string {
  const accent = brand.accentColor || '#3d7fa6';
  const addr = brand.address || { line1: '', line2: '', line3: '', country: '' };
  const bank = brand.bank;
  const items = Array.isArray(invoice.items) ? invoice.items : [];

  const subTotal = Number(invoice.total || 0);
  const discount = Number(invoice.discount_amount || 0);
  const grandTotal = Number(invoice.grand_total || 0);
  const balanceDue = Number(
    invoice.outstanding_amount != null ? invoice.outstanding_amount : grandTotal,
  );
  const isDraft = invoice.docstatus === 0;

  const itemRows = items
    .map(
      (it, i) => `
    <tr>
      <td class="c-num">${i + 1}</td>
      <td class="c-item">
        <div class="item-name">${esc(it.item_name || it.item_code || '')}</div>
        ${
          it.description && it.description !== it.item_name
            ? `<div class="item-desc">${esc(String(it.description).replace(/<[^>]*>/g, ''))}</div>`
            : ''
        }
      </td>
      <td class="c-r">${Number(it.qty || 0).toFixed(2)}</td>
      <td class="c-r">${num(it.rate)}</td>
      <td class="c-r">${num(it.amount)}</td>
    </tr>`,
    )
    .join('');

  const logo = brand.logoPath
    ? `<img src="${esc(brand.logoPath)}" alt="logo" class="logo-img" />`
    : '';

  const bankBlock =
    brand.showBankDetails && (bank.accountName || bank.accountNo)
      ? `
    <div class="bank">
      <div>//Bank Details</div>
      ${bank.accountName ? `<div>Account name: ${esc(bank.accountName)}</div>` : ''}
      ${bank.bankName ? `<div>Bank Name: ${esc(bank.bankName)}</div>` : ''}
      ${bank.accountNo ? `<div>Account No: ${esc(bank.accountNo)}</div>` : ''}
      ${bank.branch ? `<div>Branch Name: ${esc(bank.branch)}</div>` : ''}
      ${bank.ifsc ? `<div>IFSC Code: ${esc(bank.ifsc)}</div>` : ''}
      ${bank.pan ? `<div>PAN Card: ${esc(bank.pan)}</div>` : ''}
    </div>`
      : '';

  const qrBlock =
    brand.showQr && qrDataUrl
      ? `
    <div class="qr">
      <img src="${qrDataUrl}" alt="Scan to Pay" />
      <span>Scan to Pay</span>
    </div>`
      : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(invoice.name || 'Invoice')}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #333; background: #f3f4f6; padding: 24px; }
  .toolbar { max-width: 800px; margin: 0 auto 16px; display: flex; justify-content: flex-end; gap: 8px; }
  .btn { background: ${accent}; color: #fff; border: 0; padding: 8px 16px; border-radius: 6px; font-size: 14px; cursor: pointer; text-decoration: none; }
  .btn.secondary { background: #fff; color: #555; border: 1px solid #ddd; }
  .draft-badge { background: #fde68a; color: #92400e; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; margin-right: auto; }
  .page { max-width: 800px; margin: 0 auto; background: #fff; padding: 48px 56px; box-shadow: 0 1px 4px rgba(0,0,0,.1); }
  .head { display: flex; justify-content: space-between; align-items: flex-start; }
  .logo-img { max-height: 64px; max-width: 200px; margin-bottom: 6px; }
  .co-name { font-size: 20px; font-weight: 700; color: #222; }
  .co-tag { font-size: 10px; letter-spacing: 3px; color: #888; margin-bottom: 10px; }
  .addr { font-size: 12px; color: #555; line-height: 1.6; }
  .head-right { text-align: right; }
  .inv-title { font-size: 34px; font-weight: 300; color: ${accent}; letter-spacing: 1px; }
  .inv-no { font-size: 13px; color: ${accent}; margin-bottom: 24px; }
  .bal-label { font-size: 12px; color: #777; }
  .bal-amt { font-size: 20px; font-weight: 700; color: #222; }
  .meta { display: flex; justify-content: flex-end; margin-top: 28px; }
  .meta table td { font-size: 12px; padding: 3px 0; }
  .meta td.k { color: #777; text-align: right; padding-right: 16px; }
  .meta td.v { color: #222; font-weight: 500; text-align: right; min-width: 90px; }
  .billto { margin-top: 20px; }
  .billto .lbl { font-size: 12px; color: #777; }
  .billto .name { font-size: 15px; font-weight: 600; color: #222; }
  .subject { margin-top: 18px; font-size: 12px; }
  .subject .lbl { color: #777; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 22px; }
  table.items thead th { background: ${accent}; color: #fff; font-size: 12px; font-weight: 500; text-align: left; padding: 8px 10px; }
  table.items thead th.c-r { text-align: right; }
  table.items tbody td { border-bottom: 1px solid #eee; padding: 10px; font-size: 13px; vertical-align: top; }
  .c-num { width: 32px; color: #888; }
  .c-r { text-align: right; white-space: nowrap; }
  .item-name { font-weight: 500; color: #222; }
  .item-desc { font-size: 11px; color: #999; margin-top: 2px; }
  .totals { display: flex; justify-content: flex-end; margin-top: 4px; }
  .totals table { width: 300px; }
  .totals td { padding: 6px 10px; font-size: 13px; }
  .totals td.k { color: #777; text-align: right; }
  .totals td.v { text-align: right; color: #222; }
  .totals tr.grand td { font-weight: 600; }
  .totals tr.due td { background: #eef4f8; font-size: 16px; font-weight: 700; color: #222; padding: 12px 10px; }
  .inwords { text-align: right; font-size: 12px; color: #555; margin-top: 8px; }
  .inwords .lbl { color: #888; margin-right: 6px; }
  .notes { margin-top: 40px; font-size: 12px; color: #555; line-height: 1.7; }
  .notes .title { font-size: 13px; color: #333; margin-bottom: 4px; }
  .bank { margin-top: 10px; }
  .qr { margin-top: 20px; display: flex; align-items: center; gap: 12px; background: #f7f7f7; padding: 14px; border-radius: 8px; width: fit-content; }
  .qr img { width: 96px; height: 96px; }
  .qr span { font-size: 13px; color: #555; }
  .foot { max-width: 800px; margin: 20px auto 0; display: flex; justify-content: space-between; font-size: 11px; color: #aaa; padding-top: 12px; border-top: 1px solid #eee; }
  @media print {
    body { background: #fff; padding: 0; }
    .toolbar { display: none; }
    .page { box-shadow: none; max-width: none; padding: 32px; }
    .foot { border: 0; }
  }
</style></head>
<body>
  <div class="toolbar">
    ${isDraft ? '<span class="draft-badge">DRAFT — not yet submitted to books</span>' : ''}
    <a class="btn secondary" href="javascript:history.back()">Back</a>
    <button class="btn" onclick="window.print()">Print / Save PDF</button>
  </div>
  <div class="page">
    <div class="head">
      <div class="head-left">
        ${logo}
        <div class="co-name">${esc(brand.companyName || '')}</div>
        ${brand.tagline ? `<div class="co-tag">${esc(brand.tagline)}</div>` : ''}
        <div class="addr">
          ${addr.line1 ? `<div>${esc(addr.line1)}</div>` : ''}
          ${addr.line2 ? `<div>${esc(addr.line2)}</div>` : ''}
          ${addr.line3 ? `<div>${esc(addr.line3)}</div>` : ''}
          ${addr.country ? `<div>${esc(addr.country)}</div>` : ''}
          ${brand.phone ? `<div>${esc(brand.phone)}</div>` : ''}
          ${brand.email ? `<div>${esc(brand.email)}</div>` : ''}
        </div>
      </div>
      <div class="head-right">
        <div class="inv-title">INVOICE</div>
        <div class="inv-no"># ${esc(invoice.custom_invoice_number || invoice.name || '')}</div>
        <div class="bal-label">Balance Due</div>
        <div class="bal-amt">${inr(balanceDue)}</div>
      </div>
    </div>

    <div class="meta">
      <table>
        <tr><td class="k">Invoice Date :</td><td class="v">${fmtDate(invoice.posting_date)}</td></tr>
        ${
          invoice.payment_terms_template
            ? `<tr><td class="k">Terms :</td><td class="v">${esc(invoice.payment_terms_template)}</td></tr>`
            : ''
        }
        <tr><td class="k">Due Date :</td><td class="v">${fmtDate(invoice.due_date)}</td></tr>
      </table>
    </div>

    <div class="billto">
      <div class="lbl">Bill To</div>
      <div class="name">${esc(invoice.customer_name || invoice.customer || '')}</div>
    </div>

    ${
      invoice.remarks
        ? `<div class="subject"><span class="lbl">Subject :</span><div>${esc(invoice.remarks)}</div></div>`
        : ''
    }

    <table class="items">
      <thead><tr>
        <th class="c-num">#</th><th>Item &amp; Description</th>
        <th class="c-r">Qty</th><th class="c-r">Rate</th><th class="c-r">Amount</th>
      </tr></thead>
      <tbody>${itemRows}</tbody>
    </table>

    <div class="totals">
      <table>
        <tr><td class="k">Sub Total</td><td class="v">${num(subTotal)}</td></tr>
        ${discount ? `<tr><td class="k">Discount</td><td class="v">(-) ${num(discount)}</td></tr>` : ''}
        <tr class="grand"><td class="k">Total</td><td class="v">${inr(grandTotal)}</td></tr>
        <tr class="due"><td class="k">Balance Due</td><td class="v">${inr(balanceDue)}</td></tr>
      </table>
    </div>
    ${
      invoice.in_words
        ? `<div class="inwords"><span class="lbl">Total In Words:</span>${esc(invoice.in_words)}</div>`
        : ''
    }

    <div class="notes">
      ${brand.notes ? `<div class="title">${esc(brand.notesTitle || 'Notes')}</div><div>${esc(brand.notes)}</div>` : ''}
      ${bankBlock}
      ${qrBlock}
    </div>
  </div>
  <div class="foot">
    <span>${esc(brand.footerText || '')}</span>
    <span>1</span>
  </div>
</body></html>`;
}
