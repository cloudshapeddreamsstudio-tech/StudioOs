import qrcore from 'qrcode/lib/core/qrcode';
import svgTag from 'qrcode/lib/renderer/svg-tag';
import type { BrandConfig } from '../schemas/brand';
import type { InvoiceDoc } from './invoiceHtml';

/**
 * Builds the UPI Scan-to-Pay QR as a data: URL (empty string if not configured).
 *
 *   upi://pay?pa=<vpa>&pn=<name>&am=<amount>&cu=INR&tn=<note>
 *
 * The QR is *pre-filled*: scanning it opens the payer's UPI app with the exact
 * balance-due amount AND the project name already in the note, so the client
 * types nothing.
 *
 * Ported from the `buildPayQr` helper in `server/routes/invoices.js`, with one
 * necessary change: the original called `QRCode.toDataURL()`, which produces a
 * PNG via `pngjs` and needs Node's zlib/stream. Workers have neither. This
 * renders **SVG** instead -- pure string output, no Node built-ins -- and wraps
 * it as a data: URL so the `<img src>` in the invoice template is unchanged.
 * Visually identical, and it scales better in print.
 */
export async function buildPayQr(
  brand: BrandConfig,
  invoice: InvoiceDoc,
  projectName?: string,
): Promise<string> {
  if (!brand.showQr || !brand.upiId) return '';

  const payee = brand.bank?.accountName || brand.companyName || 'Payee';
  const amount = Number(
    invoice.outstanding_amount != null ? invoice.outstanding_amount : invoice.grand_total || 0,
  );
  // Note shown in the payer's app: project name first, falling back to the
  // invoice subject, then the invoice number.
  const note = projectName || invoice.remarks || invoice.project || invoice.name || 'Invoice';

  const upi =
    `upi://pay?pa=${encodeURIComponent(brand.upiId)}&pn=${encodeURIComponent(payee)}` +
    `&am=${amount}&cu=INR&tn=${encodeURIComponent(note)}`;

  try {
    const svg = svgQr(upi, { margin: 1, width: 200 });
    // encodeURIComponent rather than btoa: the SVG is ASCII, and this avoids
    // any base64/binary handling differences between runtimes.
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  } catch (err) {
    console.error('QR generation failed', err);
    return '';
  }
}

/**
 * The QR as an SVG string. Exactly what `QRCode.toString(text, {type: 'svg'})`
 * returns -- tests/payQr.test.ts compares the bytes -- but it calls qrcode's
 * core and SVG renderer directly. The package entry point also loads the PNG
 * renderer and `pngjs`, whose `util.inherits(…, Stream)` crashes the Worker at
 * start under the Vite plugin. See docs/adr/0004-the-development-loop.md.
 */
export function svgQr(text: string, opts: { margin?: number; width?: number }): string {
  return svgTag.render(qrcore.create(text, opts), opts);
}
