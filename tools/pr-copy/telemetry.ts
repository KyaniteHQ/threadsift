import { setTimeout as sleep } from "node:timers/promises";

import { z } from "zod";

import { type Stage, PageSchema, cloudflareCall } from "./cloudflare.ts";

const PAGE_SIZE = 100;
const POLL_MS = 5000;

export const TRIGGERS = ["fetch", "queue", "scheduled"] as const;

export type Trigger = (typeof TRIGGERS)[number];

const OUTCOMES = [
  "ok",
  "exception",
  "exceededCpu",
  "exceededMemory",
  "canceled",
  "responseStreamDisconnected",
  "scriptNotFound",
] as const;

export type Outcome = (typeof OUTCOMES)[number] | "other";

export interface Invocation {
  readonly requestId: string;
  readonly at: number;
  readonly trigger: Trigger;
  readonly name: string;
  readonly outcome: Outcome;
  readonly cpuMs: number;
  readonly wallMs: number;
  readonly version: string;
  readonly status: number | null;
  readonly errorLogged: boolean;
}

export interface Window {
  readonly from: number;
  readonly to: number;
}

interface Scope {
  readonly version: string;
  readonly trigger?: Trigger;
}

const RequestId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/u);

const CRON = /^[0-9*/, -]{1,40}$/u;

const ROUTE = /^\/api(?:\/[a-z:-]+)*$/u;

const WorkersFields = z
  .looseObject({
    eventType: z.string(),
    scriptName: z.string(),
    outcome: z.string().optional(),
    cpuTimeMs: z.number().optional(),
    wallTimeMs: z.number().optional(),
    scriptVersion: z.looseObject({ id: z.string().optional() }).readonly().optional(),
    event: z
      .looseObject({
        queue: z.string().optional(),
        cron: z.string().optional(),
        request: z
          .looseObject({ path: z.string().optional(), url: z.string().optional() })
          .readonly()
          .optional(),
        response: z.looseObject({ status: z.number().optional() }).readonly().optional(),
      })
      .readonly()
      .optional(),
  })
  .readonly();

const LogEventSchema = z
  .looseObject({
    timestamp: z.number(),
    $metadata: z
      .looseObject({ id: z.string(), requestId: RequestId, level: z.string().optional() })
      .readonly(),
    $workers: WorkersFields.optional(),
  })
  .readonly();

type LogEvent = z.infer<typeof LogEventSchema>;

const QueryResult = PageSchema.extend({
  result: z.looseObject({
    invocations: z.record(z.string(), z.array(LogEventSchema).readonly()).optional(),
  }),
});

function triggerOf(eventType: string): Trigger | null {
  if (eventType === "fetch" || eventType === "queue") return eventType;

  return eventType === "scheduled" || eventType === "cron" ? "scheduled" : null;
}

function outcomeOf(outcome: string | undefined): Outcome {
  return OUTCOMES.find((known) => known === outcome) ?? "other";
}

export function routeTemplate(path: string): string {
  const template = path.replaceAll(/\/\d+(?=\/|$)/gu, "/:id");

  return ROUTE.test(template) ? template : "other";
}

function statusOf(status: number | undefined): number | null {
  return status !== undefined && Number.isInteger(status) && status >= 100 && status < 600
    ? status
    : null;
}

function nameOf(
  queue: string,
  trigger: Trigger,
  seen: Readonly<{ queue: string | undefined; cron: string | undefined; path: string }>,
): string {
  if (trigger === "fetch") return routeTemplate(seen.path);

  if (trigger === "queue") return seen.queue === queue ? queue : "other";

  return CRON.test(seen.cron ?? "") ? (seen.cron ?? "other") : "other";
}

function invocationOf(
  stage: Readonly<Stage>,
  scope: Readonly<Scope>,
  events: readonly LogEvent[],
): Invocation | null {
  const log = events.find((event) => event.$workers?.cpuTimeMs !== undefined);
  const fields = log?.$workers;
  const trigger = triggerOf(fields?.eventType ?? "");
  const version = fields?.scriptVersion?.id;

  if (
    log === undefined ||
    fields === undefined ||
    trigger === null ||
    fields.scriptName !== stage.target.name ||
    version !== scope.version ||
    (scope.trigger !== undefined && trigger !== scope.trigger)
  ) {
    return null;
  }

  const request = fields.event?.request;
  const path = request?.path ?? (request?.url === undefined ? "" : new URL(request.url).pathname);

  return {
    requestId: log.$metadata.requestId,
    at: log.timestamp,
    trigger,
    name: nameOf(stage.target.queue, trigger, {
      path,
      queue: fields.event?.queue,
      cron: fields.event?.cron,
    }),
    outcome: outcomeOf(fields.outcome),
    cpuMs: fields.cpuTimeMs ?? 0,
    wallMs: fields.wallTimeMs ?? 0,
    version,
    status: trigger === "fetch" ? statusOf(fields.event?.response?.status) : null,
    errorLogged: events.some((event) => event.$metadata.level === "error"),
  };
}

function equals(key: string, value: string) {
  return { key, operation: "eq", type: "string", value };
}

function filtersFor(stage: Readonly<Stage>, scope: Readonly<Scope>) {
  const filters = [
    equals("$metadata.service", stage.target.name),
    equals("$workers.scriptVersion.id", scope.version),
  ];

  if (scope.trigger !== undefined) filters.push(equals("$workers.eventType", scope.trigger));

  return filters;
}

async function queryPage(
  stage: Readonly<Stage>,
  scope: Readonly<Scope>,
  window: Readonly<Window>,
  cursor: string | null,
) {
  const body = {
    queryId: "threadsift-copy-checks",
    dry: true,
    view: "invocations",
    limit: PAGE_SIZE,
    timeframe: { from: window.from, to: window.to },
    offset: cursor ?? undefined,
    parameters: { datasets: [], filters: filtersFor(stage, scope), limit: PAGE_SIZE },
  };

  const { result } = await cloudflareCall(
    "POST",
    "workers/observability/telemetry/query",
    QueryResult,
    JSON.stringify(body),
  );

  return Object.values(result.invocations ?? {});
}

async function allPages(
  stage: Readonly<Stage>,
  scope: Readonly<Scope>,
  window: Readonly<Window>,
  cursor: string | null,
): Promise<(readonly LogEvent[])[]> {
  const page = await queryPage(stage, scope, window, cursor);
  const last = page.at(-1)?.at(-1)?.$metadata.id;

  if (page.length < PAGE_SIZE || last === undefined) return page;

  return [...page, ...(await allPages(stage, scope, window, last))];
}

export async function readInvocations(
  stage: Readonly<Stage>,
  scope: Readonly<Scope>,
  window: Readonly<Window>,
): Promise<Invocation[]> {
  const found = (await allPages(stage, scope, window, null)).flatMap((events) => {
    const invocation = invocationOf(stage, scope, events);

    return invocation === null || invocation.at < window.from || invocation.at > window.to
      ? []
      : [invocation];
  });

  const byRequest = new Map(found.map((invocation) => [invocation.requestId, invocation]));

  return [...byRequest.values()].toSorted((a, b) => a.at - b.at);
}

export async function awaitInvocations(
  stage: Readonly<Stage>,
  scope: Readonly<Scope>,
  window: Readonly<Window>,
  until: Readonly<{ deadlineMs: number; enough: (found: readonly Invocation[]) => boolean }>,
): Promise<{ found: Invocation[]; complete: boolean }> {
  const give = Date.now() + until.deadlineMs;
  const found = await readInvocations(stage, scope, window);

  if (until.enough(found)) return { found, complete: true };

  if (Date.now() >= give) return { found, complete: false };

  await sleep(POLL_MS);

  return awaitInvocations(stage, scope, window, { ...until, deadlineMs: give - Date.now() });
}
