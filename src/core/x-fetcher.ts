import type { Fetched } from "./details.ts";
import { report } from "./failure-log.ts";
import { isLastAttempt, retryDelayMs } from "./job-retry.ts";
import { statusIdOf } from "./links.ts";
import type { Network } from "./network.ts";
import type { Ports } from "./ports.ts";
import type { UnreadableResult, XFetcher } from "./x-fetcher-port.ts";
import type { XReadNote } from "./x-read-note.ts";
import { readFetchedThread } from "./x-replies-ranked.ts";
import { shownOnX } from "./x-verify.ts";
import { StatusIdSchema, type XThreadValue } from "./x-wire.ts";

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

export interface ToVerify {
  readonly status: "to-verify";
  readonly thread: XThreadValue;
}

interface XSource {
  readonly address: string;
  readonly itemId: number;
  readonly attempts: number;
}

const POST_ABSENT = { status: "status", note: "x-post-absent" } as const;

function readAgain({ attempts }: Readonly<XSource>): Fetched {
  return {
    status: "waiting",
    until: Date.now() + (retryDelayMs(attempts) ?? 0),
    limited: true,
    wait: "x-reread",
  };
}

const CAME_BACK_EMPTY: UnreadableResult = {
  status: "unreadable",
  note: NOTE_OF_REFUSAL["no-answer"],
};

async function absentOr(
  network: Network,
  statusId: string,
  signal: AbortSignal,
  otherwise: () => Fetched,
): Promise<Fetched> {
  return (await shownOnX(network, statusId, signal)) === "absent" ? POST_ABSENT : otherwise();
}

async function concluded(
  { network, db }: Readonly<Pick<Ports, "network" | "db">>,
  fetcher: XFetcher,
  source: Readonly<XSource>,
  statusId: string,
  signal: AbortSignal,
): Promise<Fetched | ToVerify> {
  const fetched = await fetcher.fetch(statusId, signal);

  if (fetched.kind === "unanswered") {
    if (!isLastAttempt(source.attempts)) return readAgain(source);

    return absentOr(network, statusId, signal, () => fetched.ends);
  }

  if (fetched.kind === "failed") {
    if (fetched.status === "status") {
      return absentOr(network, statusId, signal, () =>
        isLastAttempt(source.attempts) ? CAME_BACK_EMPTY : readAgain(source),
      );
    }

    return fetched.note === undefined
      ? { status: fetched.status }
      : { status: fetched.status, note: fetched.note };
  }

  const read = await readFetchedThread(db, source.itemId, statusId, fetched.thread, []);

  if (read.kind === "refused") {
    report("x-fetch-refused", { category: "answer-refused" satisfies XRefusalCategory });

    return { status: "unreadable", note: NOTE_OF_REFUSAL["answer-refused"] };
  }

  return { status: "to-verify", thread: read.thread };
}

export function fetchedByX(
  ports: Readonly<Pick<Ports, "network" | "db">>,
  fetcher: XFetcher | null,
  source: Readonly<XSource>,
  signal: AbortSignal,
): Promise<Fetched | ToVerify> | null {
  const statusId = StatusIdSchema.safeParse(statusIdOf(source.address));

  return fetcher === null || !statusId.success
    ? null
    : concluded(ports, fetcher, source, statusId.data, signal);
}
