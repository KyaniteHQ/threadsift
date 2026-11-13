import { z } from "zod";

import { logFailure } from "./failure-log.ts";
import { type LoadedFetcher, type PluginPage, PluginPageSchema } from "./fetcher.ts";
import { PAGE_BYTES, pageBytes } from "./supplied-page.ts";

type PluginResult =
  | { readonly kind: "unclaimed" }
  | { readonly kind: "page"; readonly page: PluginPage }
  | { readonly kind: "failed"; readonly status: "unreadable" | "timeout" };

type Claim =
  | { readonly kind: "unclaimed" }
  | { readonly kind: "claimed"; readonly entry: LoadedFetcher }
  | { readonly kind: "failed" };

type Stage = "matches" | "fetch" | "page" | "size" | "timeout";

const UNCLAIMED = { kind: "unclaimed" } as const;

const UNREADABLE = { kind: "failed", status: "unreadable" } as const;

const TIMEOUT = { kind: "failed", status: "timeout" } as const;

const EXPIRED = Symbol("the fetch deadline passed");

function failure(module: string, stage: Stage) {
  return { module, stage };
}

function claim(fetchers: readonly LoadedFetcher[], address: string): Claim {
  for (const entry of fetchers) {
    try {
      const answer = entry.fetcher.matches(address);
      const verdict = z.boolean().safeParse(answer);

      if (!verdict.success) {
        Promise.resolve(answer).catch(() => null);
        logFailure("fetcher-failed", failure(entry.module, "matches"), verdict.error);

        return { kind: "failed" };
      }

      if (verdict.data) return { kind: "claimed", entry };
    } catch (error) {
      logFailure("fetcher-failed", failure(entry.module, "matches"), error);

      return { kind: "failed" };
    }
  }

  return UNCLAIMED;
}

async function beforeDeadline(
  start: () => Promise<PluginPage>,
  deadline: AbortSignal,
): Promise<PluginPage | typeof EXPIRED> {
  const finished = new AbortController();

  const expired = new Promise<typeof EXPIRED>((resolve) => {
    deadline.addEventListener(
      "abort",
      () => {
        resolve(EXPIRED);
      },
      { once: true, signal: finished.signal },
    );
  });

  try {
    return await Promise.race([start(), expired]);
  } finally {
    finished.abort();
  }
}

async function fetchedFrom(
  { module, fetcher }: Readonly<LoadedFetcher>,
  address: string,
  deadline: AbortSignal,
): Promise<PluginResult> {
  let answer: PluginPage | typeof EXPIRED;

  try {
    answer = await beforeDeadline(() => fetcher.fetch(address, { signal: deadline }), deadline);
  } catch (error) {
    logFailure("fetcher-failed", failure(module, deadline.aborted ? "timeout" : "fetch"), error);

    return deadline.aborted ? TIMEOUT : UNREADABLE;
  }

  if (answer === EXPIRED) {
    logFailure("fetcher-failed", failure(module, "timeout"), deadline.reason);

    return TIMEOUT;
  }

  const parsed = PluginPageSchema.safeParse(answer);

  if (!parsed.success) {
    logFailure("fetcher-failed", failure(module, "page"), parsed.error);

    return UNREADABLE;
  }

  if (pageBytes(parsed.data) > PAGE_BYTES) {
    logFailure("fetcher-failed", failure(module, "size"), new RangeError());

    return UNREADABLE;
  }

  return { kind: "page", page: parsed.data };
}

export function pluginPage(
  fetchers: readonly LoadedFetcher[],
  address: string,
  deadline: AbortSignal,
): Promise<PluginResult> {
  if (deadline.aborted) {
    logFailure("fetcher-failed", { stage: "timeout" }, deadline.reason);

    return Promise.resolve(TIMEOUT);
  }

  const claimed = claim(fetchers, address);

  if (claimed.kind === "claimed") return fetchedFrom(claimed.entry, address, deadline);

  return Promise.resolve(claimed.kind === "failed" ? UNREADABLE : UNCLAIMED);
}
