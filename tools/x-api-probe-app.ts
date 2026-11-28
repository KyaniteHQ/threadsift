import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { z } from "zod";

import { bestEffort } from "../src/core/kernel/failure-log.ts";

export type AppTarget = "container" | "worker";

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
const KEPT_LOG_LINES = 400;

const SIGNAL_EXIT = { SIGINT: 130, SIGTERM: 143 } as const;

const liveStops = new Set<() => Promise<void>>();

function stopAllOn(signal: keyof typeof SIGNAL_EXIT): void {
  process.once(signal, () => {
    void Promise.allSettled([...liveStops].map((stop) => stop())).then(() => {
      process.exit(SIGNAL_EXIT[signal]);
    });
  });
}

stopAllOn("SIGINT");
stopAllOn("SIGTERM");

const BoundSchema = z.object({ port: z.number().int().positive() });

async function freePort(): Promise<number> {
  const server = createServer();

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = BoundSchema.safeParse(server.address());

  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
  if (!address.success) throw new Error("no free local port");
  return address.data.port;
}

function freshSecret(): string {
  return randomBytes(32).toString("hex");
}

type Running = {
  readonly exitCode: () => number | null;
  readonly lines: () => readonly string[];
  readonly stop: () => Promise<void>;
};

type Place = { readonly folder: string; readonly port: number };

function spawned(
  target: AppTarget,
  { folder, port: number }: Place,
  env: Readonly<Record<string, string>>,
) {
  const port = String(number);
  const base = { HOME: folder, ...env };

  if (target === "container")
    return spawn(process.execPath, ["src/targets/node/index.ts"], {
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
      env: { PATH: dirname(process.execPath), ...base, PORT: port, DATA_DIR: join(folder, "data") },
    });

  return spawn(
    "worker-local",
    [
      join(folder, "state"),
      port,
      "--ip",
      "127.0.0.1",
      "--inspector-port",
      "0",
      "--env-file",
      join(folder, "worker.env"),
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
      env: { PATH: process.env["PATH"] ?? "", ...base },
    },
  );
}

function running(target: AppTarget, place: Place, env: Readonly<Record<string, string>>): Running {
  const child = spawned(target, place, env);
  const exited = new Promise<void>((resolve) => {
    child.once("exit", () => {
      resolve();
    });
  });
  const kept: string[] = [];
  const keep = (chunk: string) => {
    kept.push(...chunk.split("\n").filter((line) => line.trim() !== ""));
    kept.splice(0, Math.max(0, kept.length - KEPT_LOG_LINES));
  };

  child.stdout.setEncoding("utf8").on("data", keep);
  child.stderr.setEncoding("utf8").on("data", keep);
  return {
    exitCode: () => child.exitCode,
    lines: () => [...kept],
    stop: async () => {
      if (child.exitCode === null && child.pid !== undefined) {
        process.kill(-child.pid, "SIGTERM");
        await exited;
      }
      await fs.rm(place.folder, { recursive: true, force: true });
    },
  };
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

async function waitedForStart(
  origin: string,
  { exitCode, lines }: Readonly<Running>,
): Promise<void> {
  const deadline = Date.now() + START_MS;

  while (Date.now() < deadline) {
    const code = exitCode();

    if (code !== null)
      throw new Error(
        `the app exited with ${String(code)} before it answered: ${lines().slice(-5).join(" | ")}`,
      );
    // oxlint-disable-next-line eslint/no-await-in-loop -- The start is polled once a second until the app answers.
    if ((await answersSession(origin)) && exitCode() === null) return;
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
  if (cookie === null || app.exitCode() !== null) return;

  await bestEffort({ event: "x-api-probe-token-not-removed", fields: { target } }, () =>
    answered(`${origin}/api/settings/x-api`, cookie, { method: "DELETE", body: undefined }),
  );
}

export async function startedApp(
  target: AppTarget,
  env: Readonly<Record<string, string>>,
): Promise<App> {
  const folder = await fs.mkdtemp(join(tmpdir(), "threadsift-x-api-probe-"));
  const port = await freePort();
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
  const stop = async () => {
    liveStops.delete(stop);
    await tokenRemoved(target, origin, app, owner.cookie);
    await app.stop();
  };

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
