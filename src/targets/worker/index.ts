import { z } from "zod";

import { runJob } from "../../core/compose/jobs.ts";
import { tick } from "../../core/compose/tick.ts";
import type { Ports } from "../../core/kernel/ports.ts";
import { createApp } from "../../http/app.ts";
import { isDocumentPath, isServerPath } from "../../http/document-path.ts";
import { failedRequest } from "../../http/refusals.ts";
import { NO_INDEX_HEADERS } from "../../http/web-headers.ts";
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

function build(env: Env): Promise<Ports> {
  return portsOf(settingsOf(settingVariablesOf(env)), workerAdapters(env));
}

function serveDocument(request: Request, env: Env): Response | Promise<Response> {
  const { pathname } = new URL(request.url);
  const readsPage = request.method === "GET" || request.method === "HEAD";

  if (readsPage && isDocumentPath(pathname)) {
    return env.ASSETS.fetch(new Request(new URL("/", request.url), request));
  }

  return new Response("404 Not Found", { status: 404 });
}

function unindexed(response: Response): Response {
  const answer = new Response(response.body, response);

  for (const [name, value] of Object.entries(NO_INDEX_HEADERS)) answer.headers.set(name, value);

  return answer;
}

async function answerRequest(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);

  try {
    return await (isServerPath(pathname)
      ? createApp(await build(env)).fetch(request)
      : serveDocument(request, env));
  } catch (error) {
    return failedRequest(pathname, error);
  }
}

async function runMessage(env: Env, message: Readonly<JobMessage>): Promise<void> {
  const body = JobBodySchema.safeParse(message.body);

  try {
    if (body.success) {
      await runJob(await build(env), body.data.jobId);
    }
  } finally {
    message.ack();
  }
}

export default {
  fetch: async (request: Request, env: Env): Promise<Response> =>
    unindexed(await answerRequest(request, env)),
  queue: async (batch: Readonly<JobBatch>, env: Env): Promise<void> => {
    await Promise.all(batch.messages.map((message) => runMessage(env, message)));
  },
  scheduled: async (_controller: Readonly<{ cron: string }>, env: Env): Promise<void> =>
    tick(await build(env)),
};
