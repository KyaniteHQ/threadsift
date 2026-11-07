import { drizzle } from "drizzle-orm/d1";

import type { Ports } from "../../core/ports.ts";
import { aiRuntime } from "../shared/ai-runtime.ts";
import { configuredCode } from "../shared/configured-code.ts";
import { nodeCrypto } from "../shared/crypto.ts";
import { type FilesBucket, r2FileStore } from "./file-store.ts";
import { workerNetwork, workerFetch } from "./network.ts";
import { workerPageReader } from "./page-reader.ts";

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
  readonly ASSETS: Readonly<{ fetch: (input: Request) => Promise<Response> }>;
}

export async function createWorkerPorts(env: Env): Promise<Ports> {
  return {
    db: drizzle(env.DB),
    files: r2FileStore(env.FILES),
    ai: await aiRuntime({
      publicOnly: true,
      secretKey: env.THREADSIFT_SECRET_KEY,
      request: workerFetch,
    }),
    network: workerNetwork,
    pages: workerPageReader,
    jobs: {
      enqueue: (jobIds, delayMs) =>
        env.JOBS.sendBatch(
          jobIds.map((jobId) => ({ body: { jobId } })),
          { delaySeconds: Math.ceil(delayMs / 1000) },
        ),
    },
    crypto: nodeCrypto,
    setupCode: configuredCode(env.SETUP_CODE),
    resetCode: undefined,
  };
}
