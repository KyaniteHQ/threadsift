import type { Digest } from "./ai-contract.ts";
import type { Invalid, SaveResult, ThreadKept } from "./items.ts";
import type { RedditRef } from "./links.ts";
import type { Ports } from "./ports.ts";
import { parseRedditPage } from "./reddit-page.ts";
import type { SuppliedPage } from "./supplied-page.ts";
import { publish } from "./thread-paste.ts";

export function saveThreadPage(
  ports: Ports,
  absoluteUrl: string,
  {
    digest,
    page,
    ref,
  }: Readonly<{ digest: Digest | undefined; page: SuppliedPage; ref: RedditRef }>,
): Promise<SaveResult | Invalid<"page"> | ThreadKept> {
  const parsed = parseRedditPage(page, ref);

  if (parsed.kind === "refused") {
    return Promise.resolve({ kind: "invalid", field: "page", reason: parsed.reason });
  }

  return publish(ports, absoluteUrl, parsed.thread, { digest, replacement: "no-thread" });
}
