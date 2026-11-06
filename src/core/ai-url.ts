import { isRefusedHost, resolveUrl } from "./addresses.ts";

export function allowedAiUrl(address: string, publicOnly: boolean): boolean {
  const url = resolveUrl(address);

  if (
    url === null ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== "" ||
    url.search !== ""
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
