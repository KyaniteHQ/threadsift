import { z } from "zod";

import { ItemDetailResponseSchema } from "../../src/http/schemas.ts";
import { type Run, Stop } from "./check-run.ts";
import { type Findings, Inconclusive } from "./check-types.ts";
import { type Copy, callCopy, decodeAnswer, send } from "./copy-calls.ts";
import { type Item, endState, expectOk, paste } from "./copy-client.ts";
import { queryDatabase } from "./d1.ts";
import { SKEW_MS } from "./pace.ts";
import { type Invocation, type Trigger, awaitInvocations, readInvocations } from "./telemetry.ts";

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
  const { settings } = await decodeAnswer(response, "/api/settings/ai", ProviderChoice);

  if (unfinished !== 0 || pending !== 0 || settings !== null) {
    throw new Stop(
      `the copy is not idle: ${String(unfinished)} unfinished jobs, ${String(pending)} pending Digests, Provider ${settings === null ? "unset" : "set"}`,
    );
  }
}

const ProviderChoice = z.object({ settings: z.json() });

export function queryRun<Row>(
  run: Readonly<Run>,
  sql: string,
  row: z.ZodType<Row>,
  deadline?: number,
) {
  return queryDatabase(run.stage, run.database, sql, row, deadline);
}

export function fetchJobs(run: Readonly<Run>, itemId: number) {
  return queryRun(
    run,
    `SELECT id, state FROM jobs WHERE item_id = ${String(itemId)} AND kind = 'fetch' ORDER BY id`,
    JobRow,
  );
}

export async function itemDetail(copy: Readonly<Copy>, id: number) {
  const path = `/api/items/${String(id)}`;
  const response = await callCopy(copy, { path, cookie: copy.cookie });
  await expectOk(response, path);

  return (await decodeAnswer(response, path, ItemDetailResponseSchema)).item;
}

export interface Pasted {
  readonly id: number;
  readonly item: Item;
  readonly url: string;
  readonly start: number;
  readonly end: number;
  readonly consumers: readonly Invocation[];
  readonly jobs: readonly Readonly<{ id: number; state: JobState }>[];
}

function isSentinelAfter(since: number) {
  return (seen: Invocation) =>
    seen.trigger === "fetch" && seen.name === SENTINEL_ROUTE && seen.at >= since - SKEW_MS;
}

function insideOwnInterval(start: number, end: number) {
  return (seen: Invocation) =>
    seen.trigger === "queue" && seen.at >= start - SKEW_MS && seen.at <= end + SKEW_MS;
}

async function sweepAt(run: Readonly<Run>): Promise<number> {
  const rows = await queryDatabase(
    run.stage,
    run.database,
    "SELECT last_run_at AS n FROM scheduled_runs WHERE task = 'sweep'",
    Count,
  );

  return rows[0]?.n ?? 0;
}

async function attemptPaste(
  run: Readonly<Run>,
  copy: Readonly<Copy>,
  url: string,
  findings: Readonly<Findings>,
) {
  await run.pace.settle();
  await requireIdleCopy(run, copy);

  const sweptBefore = await sweepAt(run);
  const start = Date.now();
  const { id, created } = await paste(copy, url);
  findings.item(id);

  if (!created)
    throw new Inconclusive("the link was already known to the copy, so it was a refresh");

  const item = await endState(copy, id);
  const end = Date.now();
  const swept = (await sweepAt(run)) !== sweptBefore;
  const jobs = await fetchJobs(run, id);

  for (const job of jobs) findings.job(job.id);

  await send(run.url, { path: SENTINEL_ROUTE });

  const { found, complete } = await awaitInvocations(
    run.stage,
    { version: run.version },
    { from: start - SKEW_MS, to: Date.now() + INGEST_DEADLINE_MS },
    {
      deadlineMs: INGEST_DEADLINE_MS,
      enough: (seen) => seen.some(isSentinelAfter(end)) && seen.some(insideOwnInterval(start, end)),
    },
  );

  return { id, item, url, start, end, jobs, found, complete, swept };
}

function ownConsumers(
  jobs: readonly Readonly<{ id: number; state: JobState }>[],
  found: readonly Readonly<Invocation>[],
  interval: Readonly<{ start: number; end: number }>,
): Invocation[] {
  const [job, ...others] = jobs;

  if (job === undefined || others.length > 0 || job.state !== "done") {
    throw new Inconclusive(
      "the Paste has no single finished fetch job, so its consumers are ambiguous",
    );
  }

  return found.filter(insideOwnInterval(interval.start, interval.end));
}

export async function measuredPaste(
  run: Readonly<Run>,
  copy: Readonly<Copy>,
  label: string,
  base: string,
  findings: Readonly<Findings>,
  attempt = 1,
): Promise<Pasted> {
  const pasted = await attemptPaste(
    run,
    copy,
    withTag(base, `${run.tag}-${label}-${String(attempt)}`),
    findings,
  );

  run.pace.done();

  if (!pasted.complete) {
    throw new Inconclusive(
      "the telemetry did not show the Paste's invocations before the deadline",
    );
  }

  findings.used(pasted.found);

  if (pasted.swept) {
    if (attempt >= ATTEMPTS) {
      throw new Inconclusive(`a Cron sweep fell inside the window of ${String(ATTEMPTS)} attempts`);
    }

    return measuredPaste(run, copy, label, base, findings, attempt + 1);
  }

  const consumers = ownConsumers(pasted.jobs, pasted.found, pasted);
  findings.measure(`Paste ${label}: Item id`, pasted.id);
  findings.measure(`Paste ${label}: fetch job id`, pasted.jobs[0]?.id ?? Number.NaN);

  return {
    id: pasted.id,
    item: pasted.item,
    url: pasted.url,
    start: pasted.start,
    end: pasted.end,
    jobs: pasted.jobs,
    consumers,
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
