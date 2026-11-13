import { setTimeout } from "node:timers/promises";

import { z } from "zod";

import { FETCH_DEADLINE_MS } from "../src/core/fetch-link.ts";
import { CommandFailure } from "./command-failure.ts";

const Job = z.object({
  success: z.literal(true),
  result: z.object({
    id: z.string().min(1),
    status: z.enum(["ENQUEUED", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"]),
  }),
});

const WORKER_DRAIN_MS = FETCH_DEADLINE_MS + 30_000;

export type Wrangler = (args: readonly string[]) => string;

async function drainDeletedWorker(): Promise<void> {
  await setTimeout(WORKER_DRAIN_MS);
}

async function removePreviewBucket(bucket: string): Promise<void> {
  z.string()
    .regex(/^threadsift-pr-[1-9]\d{0,7}-files$/u)
    .parse(bucket);

  const endpoint = `${accountEndpoint()}/r2/buckets/${bucket}/jobs`;
  const deadline = Date.now() + 600_000;
  const headers = authorization();

  const started = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ jobType: "prefixDelete", prefix: "" }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!started.ok)
    throw new CommandFailure({
      kind: "http",
      status: started.status,
      reason: "R2 cleanup start failed",
      recovery: "Check R2 token permissions and any active deletion job, then rerun close.",
    });

  let job = Job.parse(await started.json()).result;

  job = await finished(job, endpoint, headers, deadline);

  if (job.status !== "COMPLETED")
    throw new CommandFailure({
      kind: "check",
      reason: `R2 cleanup job ended ${job.status}`,
      recovery: "Inspect the bucket deletion job in Cloudflare, then rerun close.",
    });
}

async function finished(
  job: Readonly<z.infer<typeof Job>["result"]>,
  endpoint: string,
  headers: Readonly<Record<string, string>>,
  deadline: number,
): Promise<z.infer<typeof Job>["result"]> {
  if (job.status !== "ENQUEUED" && job.status !== "RUNNING") return job;

  if (Date.now() >= deadline)
    throw new CommandFailure({
      kind: "check",
      reason: "R2 cleanup timed out",
      recovery: "Inspect the bucket deletion job in Cloudflare before rerunning close.",
    });
  await setTimeout(2000);

  const response = await fetch(`${endpoint}/${encodeURIComponent(job.id)}`, {
    headers,
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok)
    throw new CommandFailure({
      kind: "http",
      status: response.status,
      reason: "R2 cleanup polling failed",
      recovery: "Check R2 token permissions and account availability, then rerun close.",
    });

  return finished(Job.parse(await response.json()).result, endpoint, headers, deadline);
}

function accountEndpoint(): string {
  const account = z
    .string()
    .regex(/^[a-f0-9]{32}$/u)
    .parse(process.env["CLOUDFLARE_ACCOUNT_ID"]);

  return `https://api.cloudflare.com/client/v4/accounts/${account}`;
}

function authorization() {
  const token = z.string().min(1).parse(process.env["CLOUDFLARE_API_TOKEN"]);

  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export async function previewResourceExists(
  kind: "worker" | "bucket" | "queue",
  name: string,
): Promise<boolean> {
  z.string()
    .regex(/^threadsift-pr-[1-9]\d{0,7}(?:-files|-jobs)?$/u)
    .parse(name);

  const paths = {
    worker: `workers/scripts/${name}/settings`,
    bucket: `r2/buckets/${name}`,
    queue: `queues?name=${name}`,
  };

  const response = await fetch(`${accountEndpoint()}/${paths[kind]}`, {
    headers: authorization(),
    signal: AbortSignal.timeout(30_000),
  });

  if (response.status === 404) return false;

  if (!response.ok)
    throw new CommandFailure({
      kind: "http",
      status: response.status,
      reason: `Preview ${kind} inventory failed`,
      recovery: "Check the preview token permissions and account, then rerun close.",
    });

  if (kind !== "queue") return true;

  const answer = z
    .object({ success: z.literal(true), result: z.array(z.object({ queue_name: z.string() })) })
    .parse(await response.json());

  return answer.result.some((queue) => queue.queue_name === name);
}

export function previewDatabaseExists(name: string, wrangler: Wrangler): boolean {
  const databases = z
    .array(z.object({ name: z.string() }))
    .parse(JSON.parse(wrangler(["d1", "list", "--json"])));

  return databases.some((database) => database.name === `${name}-db`);
}

async function detachConsumer(name: string, wrangler: Wrangler): Promise<void> {
  if (!(await previewResourceExists("queue", `${name}-jobs`))) return;

  const consumers = z
    .array(z.union([z.object({ script: z.string() }), z.object({ service: z.string() })]))
    .parse(
      JSON.parse(wrangler(["queues", "consumer", "worker", "list", `${name}-jobs`, "--json"])),
    );

  if (
    consumers.some(
      (consumer) => ("script" in consumer ? consumer.script : consumer.service) === name,
    )
  )
    wrangler(["queues", "consumer", "remove", `${name}-jobs`, name]);
}

async function stopWorker(name: string, wrangler: Wrangler): Promise<void> {
  await detachConsumer(name, wrangler);

  if (await previewResourceExists("worker", name)) wrangler(["delete", "--name", name]);
}

async function removeStorage(name: string, wrangler: Wrangler): Promise<void> {
  if (await previewResourceExists("queue", `${name}-jobs`))
    wrangler(["queues", "delete", `${name}-jobs`]);

  if (await previewResourceExists("bucket", `${name}-files`)) {
    await removePreviewBucket(`${name}-files`);
    wrangler(["r2", "bucket", "delete", `${name}-files`]);
  }

  if (previewDatabaseExists(name, wrangler))
    wrangler(["d1", "delete", `${name}-db`, "--skip-confirmation"]);

  const remaining = await Promise.all([
    previewResourceExists("worker", name),
    previewResourceExists("queue", `${name}-jobs`),
    previewResourceExists("bucket", `${name}-files`),
  ]);

  if (previewDatabaseExists(name, wrangler) || remaining.some(Boolean))
    throw new CommandFailure({
      kind: "check",
      reason: "Preview cleanup incomplete; rerun close",
      recovery: "Inspect the PR manifest and preview token permissions, then rerun close.",
    });
}

export async function closePreview(name: string, wrangler: Wrangler): Promise<void> {
  await stopWorker(name, wrangler);
  await removeStorage(name, wrangler);
}

export async function resetPreview(name: string, wrangler: Wrangler): Promise<void> {
  await stopWorker(name, wrangler);
  await drainDeletedWorker();
  await removeStorage(name, wrangler);
}
