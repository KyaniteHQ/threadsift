import type { Stage } from "./cloudflare.ts";
import { routeTemplate } from "./routes.ts";
import { type LogEvent, type Scope, allPages, requireUnsampled } from "./telemetry-query.ts";
import { pause } from "./timeout.ts";

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

const CRON = /^[0-9*/, -]{1,40}$/u;

function triggerOf(eventType: string): Trigger | null {
  if (eventType === "fetch" || eventType === "queue") return eventType;

  return eventType === "scheduled" || eventType === "cron" ? "scheduled" : null;
}

function outcomeOf(outcome: string | undefined): Outcome {
  return OUTCOMES.find((known) => known === outcome) ?? "other";
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

export async function readInvocations(
  stage: Readonly<Stage>,
  scope: Readonly<Scope>,
  window: Readonly<Window>,
  deadline = Number.POSITIVE_INFINITY,
): Promise<Invocation[]> {
  const found = (await allPages(stage, scope, window, deadline)).flatMap((events) => {
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
  give = Date.now() + until.deadlineMs,
): Promise<{ found: Invocation[]; complete: boolean }> {
  const found = await readInvocations(stage, scope, window, give);

  if (until.enough(found)) {
    await requireUnsampled(stage, scope, window, Number.POSITIVE_INFINITY);

    return { found, complete: true };
  }

  if (Date.now() >= give) return { found, complete: false };

  await pause(POLL_MS, give);

  return awaitInvocations(stage, scope, window, until, give);
}
