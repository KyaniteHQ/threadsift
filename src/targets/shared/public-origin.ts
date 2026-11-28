import { LOOPBACK_HOSTNAMES } from "../../core/contract/addresses.ts";
import { X_API_ORIGIN } from "../../core/contract/x-api-contract.ts";

type OriginVariable = "THREADSIFT_PUBLIC_ORIGIN" | "THREADSIFT_X_API_ORIGIN";

class OriginInvalid extends Error {
  constructor(variable: OriginVariable) {
    const loopback = new Intl.ListFormat("en", { type: "disjunction" }).format(LOOPBACK_HOSTNAMES);

    super(
      `${variable} must be one origin: an https:// address with no credentials, path, query or fragment, or an http:// address on ${loopback}. Fix or remove the setting and start again.`,
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

function originOf(configured: string, variable: OriginVariable): string {
  const url = URL.canParse(configured) ? new URL(configured) : null;

  if (url === null || !isOriginOnly(url)) throw new OriginInvalid(variable);

  return url.origin;
}

export function publicOriginOf(configured: string | undefined): string | null {
  return configured === undefined ? null : originOf(configured, "THREADSIFT_PUBLIC_ORIGIN");
}

export function xApiOriginOf(configured: string | undefined): string {
  return configured === undefined ? X_API_ORIGIN : originOf(configured, "THREADSIFT_X_API_ORIGIN");
}
