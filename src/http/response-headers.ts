export type CacheKind = "no-store" | "private" | "file";

const PRIVATE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
} as const;

const HEADERS = {
  "no-store": { "Cache-Control": "no-store" },
  private: PRIVATE_HEADERS,
  file: {
    ...PRIVATE_HEADERS,
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Content-Security-Policy": "default-src 'none'; sandbox; frame-ancestors 'none'",
    "X-Frame-Options": "DENY",
  },
} as const satisfies Record<CacheKind, Readonly<Record<string, string>>>;

export function applyCache(response: Response, kind: CacheKind | null): void {
  if (kind === null) return;

  for (const [name, value] of Object.entries(HEADERS[kind])) {
    response.headers.set(name, value);
  }
}
