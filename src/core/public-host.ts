import { isRefusedHost } from "./addresses.ts";
import { NetworkFailure } from "./ports.ts";

export function assertPublicHost(url: string): void {
  if (isRefusedHost(new URL(url).hostname)) {
    throw new NetworkFailure("refused", "the host is not globally reachable");
  }
}
