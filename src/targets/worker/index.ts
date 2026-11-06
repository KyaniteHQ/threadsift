import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";

import { runJob, tick } from "../../core/jobs.ts";
import type { Ports } from "../../core/ports.ts";
import { createApp } from "../../http/app.ts";
import { isApiPath, isDocumentPath } from "../../http/document-path.ts";
import { nodeCrypto } from "../shared/crypto.ts";
import { configuredSetupCode } from "../shared/setup-code.ts";
import { workerNetwork } from "./network.ts";
import { workerPageReader } from "./page-reader.ts";

interface JobMessage {
  readonly body: unknown;
  readonly ack: () => void;
}

interface JobBatch {
  readonly messages: readonly JobMessage[];
}

interface Env {
  readonly DB: Parameters<typeof drizzle>[0];
  readonly JOBS: Readonly<{
    sendBatch: (
      messages: readonly Readonly<{ body: Readonly<{ jobId: number }> }>[],
      options: Readonly<{ delaySeconds: number }>,
    ) => Promise<void>;
  }>;
  readonly SETUP_CODE?: string;
  readonly ASSETS: Readonly<{ fetch: (input: Request) => Promise<Response> }>;
}

const JobBodySchema = z.object({ jobId: z.number().int() });

let ports: Ports | undefined;
let app: ReturnType<typeof createApp> | undefined;

function portsOf(env: Env): Ports {
  ports ??= {
    db: drizzle(env.DB),
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
    setupCode: configuredSetupCode(env.SETUP_CODE),
  };

  return ports;
}

function apiApp(env: Env): ReturnType<typeof createApp> {
  app ??= createApp(portsOf(env));

  return app;
}

function serveDocument(request: Request, env: Env): Response | Promise<Response> {
  const { pathname } = new URL(request.url);
  const readsPage = request.method === "GET" || request.method === "HEAD";

  if (readsPage && isDocumentPath(pathname)) {
    return env.ASSETS.fetch(new Request(new URL("/", request.url), request));
  }

  return new Response("404 Not Found", { status: 404 });
}

async function runMessage(env: Env, message: Readonly<JobMessage>): Promise<void> {
  const body = JobBodySchema.safeParse(message.body);

  try {
    if (body.success) {
      await runJob(portsOf(env), body.data.jobId);
    }
  } finally {
    message.ack();
  }
}

export default {
  fetch: (request: Request, env: Env): Response | Promise<Response> =>
    isApiPath(new URL(request.url).pathname)
      ? apiApp(env).fetch(request)
      : serveDocument(request, env),
  queue: async (batch: Readonly<JobBatch>, env: Env): Promise<void> => {
    await Promise.all(batch.messages.map((message) => runMessage(env, message)));
  },
  scheduled: (_controller: Readonly<{ cron: string }>, env: Env): Promise<void> =>
    tick(portsOf(env)),
};
