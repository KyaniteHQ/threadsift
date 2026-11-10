import { setTimeout } from "node:timers/promises";

import { z } from "zod";

const Job = z.object({
  success: z.literal(true),
  result: z.object({
    id: z.string().min(1),
    status: z.enum(["ENQUEUED", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"]),
  }),
});

export async function removePreviewBucket(bucket: string): Promise<void> {
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

  if (!started.ok) throw new Error(`R2 cleanup start failed (${String(started.status)})`);

  let job = Job.parse(await started.json()).result;

  job = await finished(job, endpoint, headers, deadline);

  if (job.status !== "COMPLETED") throw new Error("R2 cleanup failed; rerun close");
}

async function finished(
  job: Readonly<z.infer<typeof Job>["result"]>,
  endpoint: string,
  headers: Readonly<Record<string, string>>,
  deadline: number,
): Promise<z.infer<typeof Job>["result"]> {
  if (job.status !== "ENQUEUED" && job.status !== "RUNNING") return job;

  if (Date.now() >= deadline) throw new Error("R2 cleanup timed out; rerun close");
  await setTimeout(2000);

  const response = await fetch(`${endpoint}/${encodeURIComponent(job.id)}`, {
    headers,
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) throw new Error(`R2 cleanup poll failed (${String(response.status)})`);

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

  if (!response.ok) throw new Error(`Preview inventory failed (${String(response.status)})`);

  if (kind !== "queue") return true;

  const answer = z
    .object({ success: z.literal(true), result: z.array(z.object({ queue_name: z.string() })) })
    .parse(await response.json());

  return answer.result.some((queue) => queue.queue_name === name);
}
