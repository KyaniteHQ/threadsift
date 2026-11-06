import { z } from "zod";

import { runJob, tick } from "../../core/jobs.ts";
import type { Ports } from "../../core/ports.ts";
import { createApp } from "../../http/app.ts";
import { isApiPath, isDocumentPath } from "../../http/document-path.ts";
import { createWorkerPorts, type Env } from "./ports.ts";

interface JobMessage {
  readonly body: unknown;
  readonly ack: () => void;
}

interface JobBatch {
  readonly messages: readonly JobMessage[];
}

const JobBodySchema = z.object({ jobId: z.number().int() });

let ports: Promise<Ports> | undefined;
let app: Promise<ReturnType<typeof createApp>> | undefined;

function portsOf(env: Env): Promise<Ports> {
  ports ??= createWorkerPorts(env);

  return ports;
}

function apiApp(env: Env): Promise<ReturnType<typeof createApp>> {
  app ??= portsOf(env).then((configured) => createApp(configured));

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
    isApiPath(new URL(request.url).pathname)
      ? (await apiApp(env)).fetch(request)
      : serveDocument(request, env),
  queue: async (batch: Readonly<JobBatch>, env: Env): Promise<void> => {
    await Promise.all(batch.messages.map((message) => runMessage(env, message)));
  },
  scheduled: async (_controller: Readonly<{ cron: string }>, env: Env): Promise<void> =>
    tick(await portsOf(env)),
};
