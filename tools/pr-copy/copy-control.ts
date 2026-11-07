import { z } from "zod";

import { PageSchema, cloudflareCall } from "./cloudflare-api.ts";
import { type Stage, refuseOutsideTarget } from "./cloudflare.ts";

const QueueRow = z.looseObject({
  queue_id: z.string().min(1),
  queue_name: z.string(),
  settings: z.looseObject({ delivery_paused: z.boolean().optional() }).optional(),
});

async function queueRow(stage: Readonly<Stage>, queue: string) {
  refuseOutsideTarget(stage.target, [queue]);

  const body = await cloudflareCall(
    "GET",
    `queues?name=${encodeURIComponent(queue)}`,
    PageSchema.extend({ result: z.array(QueueRow) }),
  );

  const row = body.result.find((candidate) => candidate.queue_name === queue);

  if (row === undefined) {
    throw new Error(`Cloudflare lists no Queue named ${queue}`);
  }

  return { id: row.queue_id, paused: row.settings?.delivery_paused === true };
}

export async function deliveryPaused(stage: Readonly<Stage>, queue: string): Promise<boolean> {
  return (await queueRow(stage, queue)).paused;
}

export async function setDeliveryPaused(
  stage: Readonly<Stage>,
  queue: string,
  paused: boolean,
): Promise<void> {
  const { id } = await queueRow(stage, queue);

  await cloudflareCall(
    "PATCH",
    `queues/${id}`,
    PageSchema,
    JSON.stringify({ queue_name: queue, settings: { delivery_paused: paused } }),
  );

  if ((await deliveryPaused(stage, queue)) !== paused) {
    throw new Error(`${queue} did not read back delivery_paused: ${String(paused)}`);
  }
}

export async function startPurge(stage: Readonly<Stage>, queue: string): Promise<void> {
  const { id } = await queueRow(stage, queue);

  await cloudflareCall(
    "POST",
    `queues/${id}/purge`,
    PageSchema,
    JSON.stringify({ delete_messages_permanently: true }),
  );
}

export interface PurgeStatus {
  readonly startedAt: string | null;
  readonly complete: boolean;
}

export async function purgeStatus(stage: Readonly<Stage>, queue: string): Promise<PurgeStatus> {
  const { id } = await queueRow(stage, queue);

  const { result } = await cloudflareCall(
    "GET",
    `queues/${id}/purge`,
    PageSchema.extend({
      result: z.nullable(z.object({ started_at: z.string(), complete: z.boolean() })),
    }),
  );

  return { startedAt: result?.started_at ?? null, complete: result?.complete ?? false };
}

const WorkerSettings = z.looseObject({
  limits: z.looseObject({ cpu_ms: z.number().int().optional() }).optional(),
  observability: z
    .looseObject({
      enabled: z.boolean().optional(),
      head_sampling_rate: z.number().nullable().optional(),
      logs: z
        .looseObject({
          enabled: z.boolean().optional(),
          head_sampling_rate: z.number().nullable().optional(),
          invocation_logs: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
});

export interface DeployedSettings {
  readonly cpuMs: number | null;
  readonly logsOn: boolean;
  readonly sampledAtOne: boolean;
}

export async function workerSettings(
  stage: Readonly<Stage>,
  worker: string,
): Promise<DeployedSettings> {
  refuseOutsideTarget(stage.target, [worker]);

  const { result } = await cloudflareCall(
    "GET",
    `workers/scripts/${worker}/settings`,
    PageSchema.extend({ result: WorkerSettings }),
  );

  const logs = result.observability?.logs;

  return {
    cpuMs: result.limits?.cpu_ms ?? null,
    logsOn:
      result.observability?.enabled === true &&
      logs?.enabled === true &&
      logs.invocation_logs === true,
    sampledAtOne: result.observability?.head_sampling_rate === 1 && logs?.head_sampling_rate === 1,
  };
}

const DeploymentList = PageSchema.extend({
  result: z.object({
    deployments: z.array(
      z.object({ versions: z.array(z.object({ version_id: z.uuid(), percentage: z.number() })) }),
    ),
  }),
});

export async function currentVersion(stage: Readonly<Stage>, worker: string): Promise<string> {
  refuseOutsideTarget(stage.target, [worker]);

  const { result } = await cloudflareCall(
    "GET",
    `workers/scripts/${worker}/deployments`,
    DeploymentList,
  );

  const [latest] = result.deployments;
  const [version, ...others] = latest?.versions ?? [];

  if (version === undefined || others.length > 0 || version.percentage !== 100) {
    throw new Error(`${worker} has no single version at 100% in its latest deployment`);
  }

  return version.version_id;
}

const VersionBindings = PageSchema.extend({
  result: z.looseObject({
    resources: z.looseObject({
      bindings: z.array(z.looseObject({ name: z.string(), type: z.string() })),
    }),
  }),
});

export async function versionBindings(
  stage: Readonly<Stage>,
  worker: string,
  version: string,
): Promise<readonly Readonly<{ name: string; type: string }>[]> {
  refuseOutsideTarget(stage.target, [worker]);

  const { result } = await cloudflareCall(
    "GET",
    `workers/scripts/${worker}/versions/${version}`,
    VersionBindings,
  );

  return result.resources.bindings;
}

export async function resumeDelivery(stage: Readonly<Stage>): Promise<boolean> {
  const { queue } = stage.target;

  try {
    if (!(await deliveryPaused(stage, queue))) return false;

    await setDeliveryPaused(stage, queue, false);

    return true;
  } catch (error) {
    throw new Error(
      `${queue} may still be paused; run: pnpm exec wrangler queues resume-delivery ${queue}`,
      { cause: error },
    );
  }
}
