// pdfjs-dist (which pdf-parse wraps) unconditionally references browser-only
// globals (DOMMatrix, ImageData, Path2D) at module-load time when it can't
// find an optional native canvas backend -- on Vercel's serverless runtime
// there is no canvas package installed, and the reference throws instead of
// staying merely unavailable, crashing the whole route module before a
// single request handler ever runs. These are only used for actual page
// rendering, never for plain text extraction (all this route does), so
// empty stubs are enough to satisfy the capability checks without pulling in
// a real (native, hard-to-bundle) canvas implementation.
if (typeof globalThis.DOMMatrix === "undefined") {
  (globalThis as unknown as { DOMMatrix: unknown }).DOMMatrix = class DOMMatrix {};
}
if (typeof globalThis.ImageData === "undefined") {
  (globalThis as unknown as { ImageData: unknown }).ImageData = class ImageData {};
}
if (typeof globalThis.Path2D === "undefined") {
  (globalThis as unknown as { Path2D: unknown }).Path2D = class Path2D {};
}
