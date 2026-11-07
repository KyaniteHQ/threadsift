import { z } from "zod";

import { Inconclusive } from "./check-types.ts";
import { PageSchema, cloudflareCall } from "./cloudflare-api.ts";
import type { Stage } from "./cloudflare.ts";
import type { Trigger, Window } from "./telemetry.ts";

const PAGE_SIZE = 100;

export interface Scope {
  readonly version: string;
  readonly trigger?: Trigger;
}

const RequestId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/u);

const WorkersFields = z
  .looseObject({
    eventType: z.string(),
    scriptName: z.string(),
    outcome: z.string().optional(),
    cpuTimeMs: z.number().optional(),
    wallTimeMs: z.number().optional(),
    truncated: z.boolean().optional(),
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

export type LogEvent = z.infer<typeof LogEventSchema>;

const InvocationsResult = PageSchema.extend({
  result: z.looseObject({
    invocations: z.record(z.string(), z.array(LogEventSchema).readonly()).optional(),
    run: z.looseObject({ status: z.string().optional() }).optional(),
    statistics: z.looseObject({ abr_level: z.number().optional() }).optional(),
  }),
});

const CalculationsResult = PageSchema.extend({
  result: z.looseObject({
    calculations: z
      .array(
        z.looseObject({
          aggregates: z.array(z.looseObject({ sampleInterval: z.number().optional() })),
        }),
      )
      .optional(),
  }),
});

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

interface QueryKind {
  readonly view: "invocations" | "calculations";
  readonly offset?: string | undefined;
  readonly calculations?: readonly Readonly<{ operator: "count" }>[] | undefined;
}

function requestBody(
  stage: Readonly<Stage>,
  scope: Readonly<Scope>,
  window: Readonly<Window>,
  kind: Readonly<QueryKind>,
) {
  return JSON.stringify({
    queryId: "threadsift-copy-checks",
    dry: true,
    limit: PAGE_SIZE,
    timeframe: { from: window.from, to: window.to },
    view: kind.view,
    offset: kind.offset,
    parameters: {
      datasets: [],
      filters: filtersFor(stage, scope),
      calculations: kind.calculations,
      limit: PAGE_SIZE,
    },
  });
}

function requireComplete(status: string | undefined, abrLevel: number | undefined): void {
  if (status !== "COMPLETED") {
    throw new Inconclusive("the telemetry query did not complete");
  }

  if ((abrLevel ?? 1) !== 1) {
    throw new Inconclusive("the telemetry query read sampled data (abr_level above 1)");
  }
}

async function queryPage(
  stage: Readonly<Stage>,
  scope: Readonly<Scope>,
  window: Readonly<Window>,
  cursor: string | null,
  deadline: number,
) {
  const { result } = await cloudflareCall(
    "POST",
    "workers/observability/telemetry/query",
    InvocationsResult,
    requestBody(stage, scope, window, { view: "invocations", offset: cursor ?? undefined }),
    deadline,
  );

  requireComplete(result.run?.status, result.statistics?.abr_level);

  const page = Object.values(result.invocations ?? {});

  if (page.some((events) => events.some((event) => event.$workers?.truncated === true))) {
    throw new Inconclusive("an invocation record in the telemetry is truncated");
  }

  return page;
}

export async function allPages(
  stage: Readonly<Stage>,
  scope: Readonly<Scope>,
  window: Readonly<Window>,
  deadline: number,
  cursor: string | null = null,
): Promise<(readonly LogEvent[])[]> {
  const page = await queryPage(stage, scope, window, cursor, deadline);
  const last = page.at(-1)?.at(-1)?.$metadata.id;

  if (page.length < PAGE_SIZE || last === undefined) return page;

  return [...page, ...(await allPages(stage, scope, window, deadline, last))];
}

export async function requireUnsampled(
  stage: Readonly<Stage>,
  scope: Readonly<Scope>,
  window: Readonly<Window>,
  deadline: number,
): Promise<void> {
  const { result } = await cloudflareCall(
    "POST",
    "workers/observability/telemetry/query",
    CalculationsResult,
    requestBody(stage, scope, window, {
      view: "calculations",
      calculations: [{ operator: "count" }],
    }),
    deadline,
  );

  const intervals = (result.calculations ?? []).flatMap((entry) =>
    entry.aggregates.map((aggregate) => aggregate.sampleInterval ?? 1),
  );

  if (!intervals.every((interval) => interval === 1)) {
    throw new Inconclusive("the telemetry for this window is sampled (sampleInterval above 1)");
  }
}
