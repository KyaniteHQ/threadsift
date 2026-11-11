import { webUrlOf } from "./addresses.ts";
import { fits } from "./image-download.ts";
import { hostOf, isRedditOrXLink, isRefusedLink, isVideoLink } from "./links.ts";
import { scanMarkdown } from "./markdown-images.ts";

export interface HopPost {
  readonly url: string | null;
  readonly text: string | null;
}

function isHopTarget(address: string): boolean {
  return (
    fits(address) &&
    !isRedditOrXLink(address) &&
    !hostOf(address).endsWith(".redd.it") &&
    !isVideoLink(address) &&
    !isRefusedLink(address)
  );
}

function firstTarget(addresses: readonly (string | null)[]): string | null {
  for (const address of addresses) {
    const url = address === null ? null : webUrlOf(address);

    if (url !== null && isHopTarget(url.href)) return url.href;
  }

  return null;
}

export function hopTarget({ url, text }: Readonly<HopPost>): string | null {
  return firstTarget([url]) ?? (text === null ? null : firstTarget(scanMarkdown(text, true).links));
}
