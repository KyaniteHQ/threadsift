import { drizzle } from "drizzle-orm/d1";

import { NOTHING } from "../../core/contract/nothing.ts";
import { batchesOf } from "../../core/kernel/batches.ts";
import { originFetch } from "../../core/kernel/origin-fetch.ts";
import type { TargetAdapters } from "../shared/ports.ts";
import type { SettingVariables } from "../shared/settings.ts";
import { type AiBinding, bindingRunner } from "./ai-binding.ts";
import { type FilesBucket, r2FileStore } from "./file-store.ts";
import { workerNetwork } from "./network.ts";
import { workerPageReader } from "./page-reader.ts";

const MAX_QUEUE_DELAY_SECONDS = 86_400;

// sendBatch takes at most 100 messages per call: https://developers.cloudflare.com/queues/platform/limits/
const QUEUE_BATCH_MESSAGES = 100;

export interface Env extends SettingVariables {
  readonly DB: Parameters<typeof drizzle>[0];
  readonly FILES: FilesBucket;
  readonly JOBS: Readonly<{
    sendBatch: (
      messages: readonly Readonly<{ body: Readonly<{ jobId: number }> }>[],
      options: Readonly<{ delaySeconds: number }>,
    ) => Promise<void>;
  }>;
  readonly ASSETS: Readonly<{ fetch: (input: Request) => Promise<Response> }>;
  readonly AI?: AiBinding;
}

export function workerAdapters(env: Env): TargetAdapters {
  return {
    db: drizzle(env.DB),
    files: r2FileStore(env.FILES),
    network: workerNetwork,
    vaultFolder: null,
    pages: workerPageReader,
    jobs: {
      wake: NOTHING,
      enqueue: async (jobIds: readonly number[], delayMs: number) => {
        await Promise.all(
          batchesOf(jobIds, QUEUE_BATCH_MESSAGES).map((batch) =>
            env.JOBS.sendBatch(
              batch.map((jobId) => ({ body: { jobId } })),
              { delaySeconds: Math.min(Math.ceil(delayMs / 1000), MAX_QUEUE_DELAY_SECONDS) },
            ),
          ),
        );
      },
    },
    fetchers: [],
    xFetcher: null,
    ai: {
      publicOnly: true,
      request: originFetch,
      binding: env.AI === undefined ? null : bindingRunner(env.AI),
      cli: [],
    },
  };
}
