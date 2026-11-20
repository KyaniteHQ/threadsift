const LOCAL_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1"]);

class PublicOriginInvalid extends Error {
  constructor() {
    super(
      "THREADSIFT_PUBLIC_ORIGIN must be one origin: an https:// address with no credentials, path, query or fragment, or an http:// address on localhost or 127.0.0.1. Fix or remove the setting and start again.",
    );
  }
}

function isOriginOnly(
  url: Readonly<Pick<URL, "href" | "origin" | "protocol" | "hostname">>,
): boolean {
  if (url.href !== `${url.origin}/`) return false;

  return url.protocol === "https:" || (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname));
}

export function publicOriginOf(configured: string | undefined): string | null {
  if (configured === undefined) return null;

  const url = URL.canParse(configured) ? new URL(configured) : null;

  if (url === null || !isOriginOnly(url)) throw new PublicOriginInvalid();

  return url.origin;
}
