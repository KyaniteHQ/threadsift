import { z } from "zod";

import { AiSettingsViewSchema } from "../../src/core/ai-contract.ts";
import { ItemDetailResponseSchema } from "../../src/http/schemas.ts";
import { type Run, Stop } from "./check-run.ts";
import { type Findings, Inconclusive } from "./check-types.ts";
import { type Copy, callCopy, send } from "./copy-calls.ts";
import { type Item, endState, expectOk, paste } from "./copy-client.ts";
import { queryDatabase } from "./d1.ts";
import { type Invocation, type Trigger, awaitInvocations, readInvocations } from "./telemetry.ts";

export const SKEW_MS = 10_000;

export const INGEST_DEADLINE_MS = 180_000;
export const SENTINEL_ROUTE = "/api/session";

const ATTEMPTS = 2;
const IDLE_LOOKBACK_MS = 3 * 3_600_000;
const MS_PER_MINUTE = 60_000;

const Count = z.object({ n: z.number().int() });

const JobRow = z.object({ id: z.number().int(), state: z.enum(["queued", "running", "done"]) });

export type JobState = z.infer<typeof JobRow>["state"];

export function withTag(url: string, tag: string): string {
  const tagged = new URL(url);
  tagged.searchParams.set("threadsift-check", tag);

  return tagged.href;
}

export async function requireIdleCopy(run: Readonly<Run>, copy: Readonly<Copy>): Promise<void> {
  const counts = [
    "SELECT count(*) AS n FROM jobs WHERE state <> 'done'",
    "SELECT count(*) AS n FROM items WHERE pending_digest IS NOT NULL",
  ];

  const [unfinished, pending] = await Promise.all(
    counts.map(
      async (sql) => (await queryDatabase(run.stage, run.database, sql, Count))[0]?.n ?? 1,
    ),
  );

  const response = await callCopy(copy, { path: "/api/settings/ai", cookie: copy.cookie });
  await expectOk(response, "/api/settings/ai");
  const { settings } = AiSettingsViewSchema.parse(await response.json());

  if (unfinished !== 0 || pending !== 0 || settings !== null) {
    throw new Stop(
      `the copy is not idle: ${String(unfinished)} unfinished jobs, ${String(pending)} pending Digests, Provider ${settings === null ? "unset" : "set"}`,
    );
  }
}

export function fetchJobs(run: Readonly<Run>, itemId: number) {
  return queryDatabase(
    run.stage,
    run.database,
    `SELECT id, state FROM jobs WHERE item_id = ${String(itemId)} AND kind = 'fetch' ORDER BY id`,
    JobRow,
  );
}

export async function itemDetail(copy: Readonly<Copy>, id: number) {
  const path = `/api/items/${String(id)}`;
  const response = await callCopy(copy, { path, cookie: copy.cookie });
  await expectOk(response, path);

  return ItemDetailResponseSchema.parse(await response.json()).item;
}

export interface Pasted {
  readonly id: number;
  readonly item: Item;
  readonly url: string;
  readonly start: number;
  readonly end: number;
  readonly consumers: readonly Invocation[];
}

function isSentinelAfter(since: number) {
  return (seen: Invocation) =>
    seen.trigger === "fetch" && seen.name === SENTINEL_ROUTE && seen.at >= since - SKEW_MS;
}

async function attemptPaste(run: Readonly<Run>, copy: Readonly<Copy>, url: string) {
  const start = Date.now();
  const id = await paste(copy, url);
  const item = await endState(copy, id);
  const end = Date.now();

  await send(run.url, { path: SENTINEL_ROUTE });

  const { found, complete } = await awaitInvocations(
    run.stage,
    { version: run.version },
    { from: start - SKEW_MS, to: Date.now() + INGEST_DEADLINE_MS },
    {
      deadlineMs: INGEST_DEADLINE_MS,
      enough: (seen) =>
        seen.some(isSentinelAfter(end)) && seen.some((entry) => entry.trigger === "queue"),
    },
  );

  const tick = found.some(
    (entry) =>
      entry.trigger === "scheduled" && entry.at >= start - SKEW_MS && entry.at <= end + SKEW_MS,
  );

  return { id, item, url, start, end, found, complete, tick };
}

export async function measuredPaste(
  run: Readonly<Run>,
  copy: Readonly<Copy>,
  base: string,
  findings: Readonly<Findings>,
  attempt = 1,
): Promise<Pasted> {
  const pasted = await attemptPaste(run, copy, withTag(base, `${run.tag}-${String(attempt)}`));
  findings.item(pasted.id);

  if (!pasted.complete) {
    throw new Inconclusive(
      "the telemetry did not show the Paste's invocations before the deadline",
    );
  }

  findings.used(pasted.found);

  if (pasted.tick) {
    if (attempt >= ATTEMPTS) {
      throw new Inconclusive(`a Cron tick fell inside the window of ${String(ATTEMPTS)} attempts`);
    }

    return measuredPaste(run, copy, base, findings, attempt + 1);
  }

  return {
    id: pasted.id,
    item: pasted.item,
    url: pasted.url,
    start: pasted.start,
    end: pasted.end,
    consumers: pasted.found.filter((entry) => entry.trigger === "queue"),
  };
}

export function consumersOk(consumers: readonly Readonly<Invocation>[]) {
  return {
    ok: consumers.length > 0 && consumers.every((entry) => entry.outcome === "ok"),
    outcomes: consumers.map((entry) => entry.outcome).join(",") || "none",
  };
}

export function sumOf(
  consumers: readonly Readonly<Invocation>[],
  field: "cpuMs" | "wallMs",
): number {
  return consumers.reduce((sum, entry) => sum + entry[field], 0);
}

export async function idleMinutes(
  run: Readonly<Run>,
  trigger: Trigger,
  now: number,
): Promise<number> {
  const earlier = await readInvocations(
    run.stage,
    { version: run.version, trigger },
    { from: now - IDLE_LOOKBACK_MS, to: now },
  );

  const last = earlier.at(-1)?.at ?? now - IDLE_LOOKBACK_MS;

  return Math.round((now - last) / MS_PER_MINUTE);
}

export async function inOrder<Each, Result>(
  items: readonly Each[],
  work: (item: Each) => Promise<Result>,
): Promise<Result[]> {
  const [first, ...rest] = items;

  if (first === undefined) return [];

  const result = await work(first);

  return [result, ...(await inOrder(rest, work))];
}
