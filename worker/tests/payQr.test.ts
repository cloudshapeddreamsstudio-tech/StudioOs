import { describe, it, expect } from 'bun:test';
import QRCode from 'qrcode';
import { svgQr } from '../src/lib/payQr';

/**
 * svgQr calls qrcode's core and its SVG renderer directly, instead of the
 * package entry point. The entry point loads the PNG renderer and pngjs, which
 * crashes the Worker under the Vite plugin (docs/adr/0004). This proves the
 * output did not change: the same bytes as `QRCode.toString(..., {type:'svg'})`.
 */
describe('svgQr', () => {
  const opts = { margin: 1, width: 200 };
  const inputs = [
    'upi://pay?pa=studio%40okaxis&pn=Cloud%20Shaped%20Dreams&am=12500.00&cu=INR&tn=PROJ-0042',
    'x',
    'upi://pay?pa=a@b&pn=' + 'N'.repeat(300),
  ];

  for (const text of inputs) {
    it(`matches the package's own SVG output (${text.length} chars)`, async () => {
      const expected = await QRCode.toString(text, { type: 'svg', ...opts });
      expect(svgQr(text, opts)).toBe(expected);
    });
  }
});
