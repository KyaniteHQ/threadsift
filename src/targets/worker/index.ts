import { z } from "zod";

import { runJob } from "../../core/compose/jobs.ts";
import { tick } from "../../core/compose/tick.ts";
import type { Ports } from "../../core/kernel/ports.ts";
import { createApp } from "../../http/app.ts";
import { isDocumentPath, isServerPath } from "../../http/document-path.ts";
import { portsOf } from "../shared/ports.ts";
import { settingVariablesOf, settingsOf } from "../shared/settings.ts";
import { type Env, workerAdapters } from "./ports.ts";

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

async function build(env: Env): Promise<Ports> {
  const adapters = workerAdapters(env);
  const built = await portsOf(settingsOf(settingVariablesOf(env)), adapters);

  return built;
}

function isolatePorts(env: Env): Promise<Ports> {
  if (ports !== undefined) return ports;

  const building = build(env);

  ports = building;

  building.catch(() => {
    if (ports === building) ports = undefined;
  });

  return building;
}

async function apiApp(env: Env): Promise<ReturnType<typeof createApp>> {
  const resetCode = settingVariablesOf(env).PASSWORD_RESET_CODE;
  const cached = api;

  if (cached !== undefined && cached.resetCode === resetCode) {
    return cached.app;
  }

  const { config, ...built } = await isolatePorts(env);
  const app = createApp({ ...built, config: { ...config, resetCode } });
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
      await runJob(await isolatePorts(env), body.data.jobId);
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
    tick(await isolatePorts(env)),
};
