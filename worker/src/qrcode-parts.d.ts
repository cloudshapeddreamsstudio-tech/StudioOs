/**
 * Types for the two qrcode modules that lib/payQr.ts imports directly. The
 * package's own types (@types/qrcode) cover only its entry point.
 */
declare module 'qrcode/lib/core/qrcode' {
  const core: { create(text: string, opts?: object): unknown };
  export default core;
}
declare module 'qrcode/lib/renderer/svg-tag' {
  const svgTag: { render(qrData: unknown, opts?: object): string };
  export default svgTag;
}
