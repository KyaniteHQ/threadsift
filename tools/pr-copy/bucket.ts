import { z } from "zod";

import {
  CloudflareAnswerError,
  PageSchema,
  accountRequest,
  cloudflareCall,
  cloudflareGet,
} from "./cloudflare-api.ts";
import { abortIncompleteUploads } from "./r2-uploads.ts";
import { pause, remaining } from "./timeout.ts";

const BUCKET_PAGE = 1000;

const EMPTY_BUCKET_MS = 10 * 60_000;

const POLL_MS = 2000;

const BucketPage = PageSchema.extend({
  result: z.object({ buckets: z.array(z.object({ name: z.string() })) }),
  result_info: z.object({ cursor: z.string().optional() }).optional(),
});

export async function listBuckets(cursor?: string): Promise<string[]> {
  const query = new URLSearchParams({ per_page: String(BUCKET_PAGE) });

  if (cursor !== undefined) {
    query.set("cursor", cursor);
  }

  const body = await cloudflareGet(`r2/buckets?${query.toString()}`, BucketPage);
  const names = body.result.buckets.map((bucket) => bucket.name);
  const next = body.result_info?.cursor;

  return next === undefined || next === "" ? names : [...names, ...(await listBuckets(next))];
}

const BucketJob = PageSchema.extend({
  result: z.object({
    id: z.string().min(1),
    status: z.enum(["ENQUEUED", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"]),
    prefixDelete: z.object({ deletedObjects: z.number().int() }).optional(),
  }),
});

type Job = z.infer<typeof BucketJob>["result"];

async function finished(
  jobs: string,
  job: Readonly<Job>,
  deadline: number,
  bucket: string,
): Promise<Job> {
  if (job.status !== "ENQUEUED" && job.status !== "RUNNING") {
    return job;
  }

  if (remaining(deadline) === 0) {
    throw new Error(`Emptying ${bucket} did not finish in time`);
  }

  await pause(POLL_MS, deadline);
  const next = await cloudflareCall("GET", `${jobs}/${job.id}`, BucketJob, undefined, deadline);

  return finished(jobs, next.result, deadline, bucket);
}

async function emptyBucket(bucket: string, deadline: number): Promise<number> {
  const jobs = `r2/buckets/${encodeURIComponent(bucket)}/jobs`;

  const started = await cloudflareCall(
    "POST",
    jobs,
    BucketJob,
    JSON.stringify({ jobType: "prefixDelete", prefix: "" }),
    deadline,
  );

  const job = await finished(jobs, started.result, deadline, bucket);

  if (job.status !== "COMPLETED") {
    throw new Error(`Emptying ${bucket} ended ${job.status}`);
  }

  return job.prefixDelete?.deletedObjects ?? 0;
}

async function bucketExists(bucket: string): Promise<boolean> {
  try {
    await accountRequest("GET", `r2/buckets/${encodeURIComponent(bucket)}`);

    return true;
  } catch (error) {
    if (error instanceof CloudflareAnswerError && error.status === 404) {
      return false;
    }

    throw error;
  }
}

export async function removeBucket(bucket: string): Promise<void> {
  const deadline = Date.now() + EMPTY_BUCKET_MS;

  try {
    const aborted = await abortIncompleteUploads(bucket, deadline);
    const deleted = await emptyBucket(bucket, deadline);

    process.stdout.write(
      `$ POST r2/buckets/${bucket}/jobs\nAborted uploads: ${String(aborted)}\nEmptied ${bucket}; objects deleted: ${String(deleted)}\n`,
    );

    await accountRequest("DELETE", `r2/buckets/${encodeURIComponent(bucket)}`);
  } catch (error) {
    if (
      !(error instanceof CloudflareAnswerError && error.status === 404) ||
      (await bucketExists(bucket))
    ) {
      throw error;
    }

    process.stdout.write(`The bucket ${bucket} is gone already\n`);

    return;
  }

  process.stdout.write(`$ DELETE r2/buckets/${bucket}\nDeleted the bucket ${bucket}\n`);
}
