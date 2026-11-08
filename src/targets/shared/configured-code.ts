const LOCAL_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1"]);

export class PublicOriginInvalid extends Error {
  constructor() {
    super(
      "THREADSIFT_PUBLIC_ORIGIN must be one origin: an https:// address with no credentials, path, query or fragment, or an http:// address on localhost or 127.0.0.1. Fix or remove the setting and start again.",
    );
  }
}

export function configuredCode(value: string | undefined): string | undefined {
  return value === "" ? undefined : value;
}

function isOriginOnly(
  url: Readonly<Pick<URL, "href" | "origin" | "protocol" | "hostname">>,
): boolean {
  if (url.href !== `${url.origin}/`) return false;

  return url.protocol === "https:" || (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname));
}

export function configuredOrigin(value: string | undefined): string | null {
  if (value === undefined || value === "") return null;

  const url = URL.canParse(value) ? new URL(value) : null;

  if (url === null || !isOriginOnly(url)) throw new PublicOriginInvalid();

  return url.origin;
}
