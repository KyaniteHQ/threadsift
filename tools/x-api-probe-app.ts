import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { z } from "zod";

import { bestEffort } from "../src/core/kernel/failure-log.ts";
import {
  type AppTarget,
  type Running,
  freePort,
  installedSignalHandlers,
  liveStops,
  running,
} from "./x-api-probe-process.ts";

export type { AppTarget };

export type AppBody = Readonly<Record<string, string | number>>;

export type AppCall = { readonly status: number; readonly text: string };

export type App = {
  readonly target: AppTarget;
  readonly origin: string;
  readonly call: (method: string, path: string, body?: AppBody) => Promise<AppCall>;
  readonly logLines: () => readonly string[];
  readonly stop: () => Promise<void>;
};

type Sent = { readonly method: string; readonly body: string | undefined };

const START_MS = 180_000;
const POLL_MS = 1000;
const CALL_MS = 30_000;

type Stopping = { done: Promise<void> | null };

function freshSecret(): string {
  return randomBytes(32).toString("hex");
}

function answered(url: string, cookie: string, { method, body }: Readonly<Sent>) {
  const headers = { "content-type": "application/json", cookie, origin: new URL(url).origin };
  const signal = AbortSignal.timeout(CALL_MS);

  return body === undefined
    ? fetch(url, { method, headers, signal })
    : fetch(url, { method, headers, body, signal });
}

async function answersSession(origin: string): Promise<boolean> {
  try {
    return (await fetch(`${origin}/api/session`)).ok;
  } catch {
    return false;
  }
}

async function waitedForStart(origin: string, { ended, lines }: Readonly<Running>): Promise<void> {
  const deadline = Date.now() + START_MS;

  while (Date.now() < deadline) {
    const how = ended();

    if (how !== null)
      throw new Error(
        `the app ended (${how}) before it answered: ${lines().slice(-5).join(" | ")}`,
      );
    // oxlint-disable-next-line eslint/no-await-in-loop -- The start is polled once a second until the app answers.
    if ((await answersSession(origin)) && ended() === null) return;
    // oxlint-disable-next-line eslint/no-await-in-loop -- The start is polled once a second until the app answers.
    await sleep(POLL_MS);
  }
  throw new Error(`the app did not answer within ${START_MS / 1000} s`);
}

const SessionCookieSchema = z.string().regex(/^[^=;\s]+=[^;\s]+$/u);

async function ownerCookie(origin: string, setupCode: string): Promise<string> {
  const setup = await answered(`${origin}/api/setup`, "", {
    method: "POST",
    body: JSON.stringify({ code: setupCode, password: freshSecret() }),
  });
  const cookie = SessionCookieSchema.safeParse(setup.headers.getSetCookie()[0]?.split(";")[0]);

  if (setup.status !== 204 || !cookie.success)
    throw new Error(`the owner setup answered ${String(setup.status)}`);
  return cookie.data;
}

type Owner = { cookie: string | null };

async function tokenRemoved(
  target: AppTarget,
  origin: string,
  app: Readonly<Running>,
  cookie: string | null,
): Promise<void> {
  if (cookie === null || app.ended() !== null) return;

  await bestEffort({ event: "x-api-probe-token-not-removed", fields: { target } }, () =>
    answered(`${origin}/api/settings/x-api`, cookie, { method: "DELETE", body: undefined }),
  );
}

function stopperOf(
  target: AppTarget,
  origin: string,
  app: Readonly<Running>,
  owner: Readonly<Owner>,
): () => Promise<void> {
  const stopping: Stopping = { done: null };
  const stopOnce = async () => {
    try {
      await tokenRemoved(target, origin, app, owner.cookie);
      await app.stop();
    } finally {
      liveStops.delete(stop);
    }
  };
  const stop = () => {
    stopping.done ??= stopOnce();
    return stopping.done;
  };

  return stop;
}

export async function startedApp(
  target: AppTarget,
  env: Readonly<Record<string, string>>,
): Promise<App> {
  installedSignalHandlers();
  const port = await freePort();
  const folder = await fs.mkdtemp(join(tmpdir(), "threadsift-x-api-probe-"));

  await fs.mkdir(join(folder, "web"));
  const secrets = { SETUP_CODE: freshSecret(), THREADSIFT_SECRET_KEY: freshSecret() };
  const variables = { ...secrets, ...env };

  await fs.writeFile(
    join(folder, "worker.env"),
    Object.entries(variables)
      .map(([key, value]) => `${key}=${value}\n`)
      .join(""),
    { mode: 0o600 },
  );
  const app = running(target, { folder, port }, variables);
  const origin = `http://127.0.0.1:${String(port)}`;
  const owner: Owner = { cookie: null };
  const stop = stopperOf(target, origin, app, owner);

  liveStops.add(stop);
  try {
    await waitedForStart(origin, app);
    const cookie = await ownerCookie(origin, secrets.SETUP_CODE);

    owner.cookie = cookie;

    return {
      target,
      origin,
      logLines: app.lines,
      stop,
      call: async (method, path, body) => {
        const answer = await answered(`${origin}${path}`, cookie, {
          method,
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        return { status: answer.status, text: await answer.text() };
      },
    };
  } catch (error) {
    await bestEffort({ event: "x-api-probe-app-not-stopped", fields: { target } }, stop);
    throw error;
  }
}
