import { drizzle } from "drizzle-orm/d1";

import type { Ports } from "../../core/ports.ts";
import { aiRuntime } from "../shared/ai-runtime.ts";
import { configuredCode, configuredOrigin } from "../shared/configured-code.ts";
import { nodeCrypto } from "../shared/crypto.ts";
import { type AiBinding, bindingRunner } from "./ai-binding.ts";
import { type FilesBucket, r2FileStore } from "./file-store.ts";
import { workerNetwork, workerFetch } from "./network.ts";
import { workerPageReader } from "./page-reader.ts";

const MAX_QUEUE_DELAY_SECONDS = 86_400;

export interface Env {
  readonly DB: Parameters<typeof drizzle>[0];
  readonly FILES: FilesBucket;
  readonly JOBS: Readonly<{
    sendBatch: (
      messages: readonly Readonly<{ body: Readonly<{ jobId: number }> }>[],
      options: Readonly<{ delaySeconds: number }>,
    ) => Promise<void>;
  }>;
  readonly SETUP_CODE?: string;
  readonly PASSWORD_RESET_CODE?: string;
  readonly THREADSIFT_SECRET_KEY?: string;
  readonly THREADSIFT_PUBLIC_ORIGIN?: string;
  readonly ASSETS: Readonly<{ fetch: (input: Request) => Promise<Response> }>;
  readonly AI?: AiBinding;
}

export async function createWorkerPorts(env: Env): Promise<Ports> {
  return {
    db: drizzle(env.DB),
    files: r2FileStore(env.FILES),
    ai: await aiRuntime({
      publicOnly: true,
      secretKey: env.THREADSIFT_SECRET_KEY,
      request: workerFetch,
      binding: env.AI === undefined ? undefined : bindingRunner(env.AI),
    }),
    network: workerNetwork,
    pages: workerPageReader,
    jobs: {
      enqueue: (jobIds, delayMs) =>
        env.JOBS.sendBatch(
          jobIds.map((jobId) => ({ body: { jobId } })),
          { delaySeconds: Math.min(Math.ceil(delayMs / 1000), MAX_QUEUE_DELAY_SECONDS) },
        ),
    },
    crypto: nodeCrypto,
    setupCode: configuredCode(env.SETUP_CODE),
    resetCode: undefined,
    publicOrigin: configuredOrigin(env.THREADSIFT_PUBLIC_ORIGIN),
  };
}
