import type { Fetched } from "./details.ts";
import { report } from "./failure-log.ts";
import type { FetchFailure } from "./fetch-results.ts";
import { RETRY_DELAYS_MS, isLastAttempt } from "./job-outcome.ts";
import type { XReadNote } from "./kinds.ts";
import { statusIdOf } from "./links.ts";
import type { Ports } from "./ports.ts";
import { parseXThreadValue } from "./x-thread.ts";
import { shownOnX } from "./x-verify.ts";
import { StatusIdSchema, type XThreadValue } from "./x-wire.ts";

export const X_FETCHER_STATES = ["signed-in", "signed-out", "not-proven", "unknown"] as const;

export type XFetcherState = (typeof X_FETCHER_STATES)[number];

export interface XFetcherStatus {
  readonly state: XFetcherState;
  readonly version: string | null;
}

export type XFetchFailure = Extract<FetchFailure, "unreadable" | "timeout" | "network" | "status">;

export interface ToVerify {
  readonly status: "to-verify";
  readonly thread: XThreadValue;
}

export type XFetch =
  | { readonly kind: "thread"; readonly thread: XThreadValue }
  | { readonly kind: "failed"; readonly status: XFetchFailure; readonly note?: XReadNote };

export type XRefusalCategory =
  | "signed-out"
  | "usage-limit"
  | "unreachable"
  | "deadline"
  | "cli-error"
  | "no-answer"
  | "over-size"
  | "spawn-failed"
  | "surface-unproven"
  | "answer-refused"
  | "fewer-replies"
  | "internal";

export const NOTE_OF_REFUSAL = {
  "signed-out": "cli-signed-out",
  "usage-limit": "cli-usage-limit",
  unreachable: "cli-unreachable",
  deadline: null,
  "cli-error": "cli-failed",
  "no-answer": "cli-failed",
  "over-size": "cli-failed",
  "spawn-failed": "cli-not-installed",
  "surface-unproven": "cli-not-proven",
  "answer-refused": "x-answer-refused",
  "fewer-replies": "x-fewer-replies",
  internal: "cli-failed",
} as const satisfies Readonly<Record<XRefusalCategory, XReadNote | null>>;

export interface XFetcher {
  readonly id: "grok-cli";
  readonly fetch: (statusId: string, signal: AbortSignal) => Promise<XFetch>;
  readonly status: () => Promise<XFetcherStatus>;
}

interface XSource {
  readonly address: string;
  readonly itemId: number;
  readonly attempts: number;
}

async function notFoundBy(
  network: Ports["network"],
  { attempts }: Readonly<XSource>,
  statusId: string,
  signal: AbortSignal,
): Promise<Fetched> {
  if (isLastAttempt(attempts) || (await shownOnX(network, statusId, signal)) === "absent") {
    return { status: "status" };
  }

  return {
    status: "waiting",
    until: Date.now() + (RETRY_DELAYS_MS[attempts] ?? 0),
    limited: true,
    wait: "x-reread",
  };
}

async function concluded(
  { network }: Readonly<Pick<Ports, "network">>,
  fetcher: XFetcher,
  source: Readonly<XSource>,
  statusId: string,
  signal: AbortSignal,
): Promise<Fetched | ToVerify> {
  const fetched = await fetcher.fetch(statusId, signal);

  if (fetched.kind === "failed") {
    if (fetched.status === "status") return notFoundBy(network, source, statusId, signal);

    return fetched.note === undefined
      ? { status: fetched.status }
      : { status: fetched.status, note: fetched.note };
  }

  if (parseXThreadValue(fetched.thread, statusId).kind === "refused") {
    report("x-fetch-refused", { category: "answer-refused" satisfies XRefusalCategory });

    return { status: "unreadable", note: NOTE_OF_REFUSAL["answer-refused"] };
  }

  return { status: "to-verify", thread: fetched.thread };
}

export function fetchedByX(
  ports: Readonly<Pick<Ports, "network">>,
  fetcher: XFetcher | null,
  source: Readonly<XSource>,
  signal: AbortSignal,
): Promise<Fetched | ToVerify> | null {
  const statusId = StatusIdSchema.safeParse(statusIdOf(source.address));

  return fetcher === null || !statusId.success
    ? null
    : concluded(ports, fetcher, source, statusId.data, signal);
}
