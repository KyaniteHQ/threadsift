import { z } from "zod";

import { runJob } from "../../core/jobs.ts";
import type { Ports } from "../../core/ports.ts";
import { tick } from "../../core/tick.ts";
import { createApp } from "../../http/app.ts";
import { isDocumentPath, isServerPath } from "../../http/document-path.ts";
import { configuredCode } from "../shared/configured-code.ts";
import { createWorkerPorts, type Env } from "./ports.ts";

interface JobMessage {
  readonly body: unknown;
  readonly ack: () => void;
}

interface JobBatch {
  readonly messages: readonly JobMessage[];
}

const JobBodySchema = z.object({ jobId: z.number().int() });

interface ApiApp {
  readonly resetCode: string | undefined;
  readonly app: ReturnType<typeof createApp>;
}

let ports: Promise<Ports> | undefined;
let api: ApiApp | undefined;

function portsOf(env: Env): Promise<Ports> {
  ports ??= createWorkerPorts(env);

  return ports;
}

async function apiApp(env: Env): Promise<ReturnType<typeof createApp>> {
  const resetCode = configuredCode(env.PASSWORD_RESET_CODE);
  const built = api;

  if (built !== undefined && built.resetCode === resetCode) {
    return built.app;
  }

  const app = createApp({ ...(await portsOf(env)), resetCode });
  api = { resetCode, app };

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
      await runJob(await portsOf(env), body.data.jobId);
    }
  } finally {
    message.ack();
  }
}

export default {
  fetch: async (request: Request, env: Env): Promise<Response> =>
    isServerPath(new URL(request.url).pathname)
      ? (await apiApp(env)).fetch(request)
      : serveDocument(request, env),
  queue: async (batch: Readonly<JobBatch>, env: Env): Promise<void> => {
    await Promise.all(batch.messages.map((message) => runMessage(env, message)));
  },
  scheduled: async (_controller: Readonly<{ cron: string }>, env: Env): Promise<void> =>
    tick(await portsOf(env)),
};
