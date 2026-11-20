import { isGlobalAddress, isRefusedHost } from "./addresses.ts";
import { NetworkFailure } from "./network.ts";

interface Resolved {
  readonly address: string;
}

type PublicAddresses<Address extends Resolved> =
  | { readonly kind: "public"; readonly addresses: [Address, ...Address[]] }
  | { readonly kind: "refused"; readonly failure: NetworkFailure };

export function assertPublicHost(url: string): void {
  if (isRefusedHost(new URL(url).hostname)) {
    throw new NetworkFailure("refused", "the host is not globally reachable");
  }
}

export function publicAddressesOf<Address extends Resolved>(
  subject: string,
  resolved: readonly Address[],
): PublicAddresses<Address> {
  const [first, ...rest] = resolved.filter(({ address }) => isGlobalAddress(address));

  return first === undefined
    ? {
        kind: "refused",
        failure: new NetworkFailure("refused", `${subject} has no globally reachable address`),
      }
    : { kind: "public", addresses: [first, ...rest] };
}
