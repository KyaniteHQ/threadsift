import { PAGE_BYTES, pageBytes } from "../contract/supplied-page.ts";
import { logFailure } from "../kernel/failure-log.ts";
import { type LoadedFetcher, type PluginPage, PluginPageSchema } from "../kernel/fetcher.ts";
import { NetworkFailure } from "../kernel/network.ts";

type PluginFailure = {
  readonly kind: "failed";
  readonly status: "unreadable" | "timeout" | "refused";
};

type PluginResult =
  | { readonly kind: "unclaimed" }
  | { readonly kind: "page"; readonly page: PluginPage }
  | PluginFailure;

type Claim =
  | { readonly kind: "unclaimed" }
  | { readonly kind: "claimed"; readonly entry: LoadedFetcher }
  | PluginFailure;

type Stage = "matches" | "fetch" | "page" | "size" | "timeout";

const UNCLAIMED = { kind: "unclaimed" } as const;

const UNREADABLE = { kind: "failed", status: "unreadable" } as const;

const TIMEOUT = { kind: "failed", status: "timeout" } as const;

const EXPIRED = Symbol("the fetch deadline passed");

function failure(module: string, stage: Stage) {
  return { module, stage };
}

async function claim(
  [entry, ...rest]: readonly LoadedFetcher[],
  address: string,
  deadline: AbortSignal,
): Promise<Claim> {
  if (entry === undefined) return UNCLAIMED;

  try {
    if (await entry.matches(address, deadline)) return { kind: "claimed", entry };
  } catch (error) {
    if (error instanceof NetworkFailure) return { kind: "failed", status: error.reason };

    logFailure("fetcher-failed", failure(entry.module, "matches"), error);

    return UNREADABLE;
  }

  return claim(rest, address, deadline);
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
  { module, fetch: fetchPage }: Readonly<LoadedFetcher>,
  address: string,
  deadline: AbortSignal,
): Promise<PluginResult> {
  let answer: PluginPage | typeof EXPIRED;

  try {
    answer = await beforeDeadline(() => fetchPage(address, { signal: deadline }), deadline);
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

export async function pluginPage(
  fetchers: readonly LoadedFetcher[],
  address: string,
  deadline: AbortSignal,
): Promise<PluginResult> {
  if (deadline.aborted) {
    logFailure("fetcher-failed", { stage: "timeout" }, deadline.reason);

    return TIMEOUT;
  }

  const claimed = await claim(fetchers, address, deadline);

  if (claimed.kind === "claimed") return fetchedFrom(claimed.entry, address, deadline);

  return claimed;
}
