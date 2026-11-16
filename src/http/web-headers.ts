const DOCUMENT_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export const REVALIDATED_HEADERS = {
  "Cache-Control": "no-cache",
  "X-Content-Type-Options": "nosniff",
} as const;

export const HASHED_ASSET_HEADERS = {
  "Cache-Control": "public, max-age=31536000, immutable",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
} as const;

export const DOCUMENT_HEADERS = {
  ...REVALIDATED_HEADERS,
  "Content-Security-Policy": DOCUMENT_POLICY,
  "Referrer-Policy": "same-origin",
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Frame-Options": "DENY",
} as const;
