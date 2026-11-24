import { LOOPBACK_HOSTNAMES } from "../../core/contract/addresses.ts";

class PublicOriginInvalid extends Error {
  constructor() {
    const loopback = new Intl.ListFormat("en", { type: "disjunction" }).format(LOOPBACK_HOSTNAMES);

    super(
      `THREADSIFT_PUBLIC_ORIGIN must be one origin: an https:// address with no credentials, path, query or fragment, or an http:// address on ${loopback}. Fix or remove the setting and start again.`,
    );
  }
}

function isOriginOnly(
  url: Readonly<Pick<URL, "href" | "origin" | "protocol" | "hostname">>,
): boolean {
  if (url.href !== `${url.origin}/`) return false;

  return (
    url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK_HOSTNAMES.has(url.hostname))
  );
}

export function publicOriginOf(configured: string | undefined): string | null {
  if (configured === undefined) return null;

  const url = URL.canParse(configured) ? new URL(configured) : null;

  if (url === null || !isOriginOnly(url)) throw new PublicOriginInvalid();

  return url.origin;
}
