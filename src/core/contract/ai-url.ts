import { isRefusedHost, resolveUrl } from "./addresses.ts";

const QUERY_OR_FRAGMENT_MARK = /[?#]/u;

export function allowedAiUrl(address: string, publicOnly: boolean): boolean {
  const url = resolveUrl(address);

  if (
    url === null ||
    url.username !== "" ||
    url.password !== "" ||
    QUERY_OR_FRAGMENT_MARK.test(address)
  ) {
    return false;
  }

  return publicOnly
    ? url.protocol === "https:" && !isRefusedHost(url.hostname)
    : url.protocol === "http:" || url.protocol === "https:";
}

export class AiAddressRefused extends Error {
  constructor() {
    super("AI address refused");
  }
}
