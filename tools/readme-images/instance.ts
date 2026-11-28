import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { z } from "zod";

import { freePort } from "./loopback.ts";
import type { Resources } from "./resources.ts";

const SESSION_WAIT_MS = 30_000;

const SESSION_POLL_MS = 250;

const STDERR_TAIL = 1500;

const SessionSchema = z.object({ state: z.string() });

const AnswerSchema = z.json();

export type Json =
  | string
  | number
  | boolean
  | null
  | readonly Json[]
  | { readonly [key: string]: Json | undefined };

export interface Instance {
  readonly base: string;
  readonly send: (method: string, path: string, body?: Json) => Promise<Json>;
  readonly cookie: string;
}

interface Server {
  readonly exited: () => string | null;
  readonly stop: () => Promise<void>;
}

async function answers(base: string): Promise<boolean> {
  try {
    const response = await fetch(`${base}/api/session`);

    return response.ok && SessionSchema.safeParse(await response.json()).success;
  } catch {
    return false;
  }
}

async function waitForSession(base: string, server: Server, deadline: number): Promise<void> {
  const gone = server.exited();

  if (gone !== null) throw new Error(`The Instance exited before it answered. ${gone}`);
  if (await answers(base)) return;
  if (Date.now() > deadline) throw new Error("The Instance did not answer /api/session in time.");
  await delay(SESSION_POLL_MS);
  await waitForSession(base, server, deadline);
}

function withoutSetupCode(text: string): string {
  return text
    .split("\n")
    .filter((line) => !line.includes("Setup code"))
    .join("\n");
}

function spawnServer(root: string, scratch: string, port: number, code: string): Server {
  const dataDir = join(scratch, "data");
  const home = join(scratch, "home");

  mkdirSync(dataDir);
  mkdirSync(home);

  const child = spawn(process.execPath, ["src/targets/node/index.ts"], {
    cwd: root,
    stdio: ["ignore", "ignore", "pipe"],
    env: {
      PATH: dirname(process.execPath),
      HOME: home,
      PORT: String(port),
      DATA_DIR: dataDir,
      SETUP_CODE: code,
      THREADSIFT_SECRET_KEY: randomBytes(32).toString("hex"),
    },
  });

  let stderr = "";

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr = (stderr + chunk).slice(-STDERR_TAIL);
  });

  const done = new Promise<void>((resolve) => {
    child.once("exit", () => {
      resolve();
    });
  });

  return {
    exited: () =>
      child.exitCode === null && child.signalCode === null
        ? null
        : `Exit ${String(child.exitCode ?? child.signalCode)}. ${withoutSetupCode(stderr)}`,
    stop: async () => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
      await done;
    },
  };
}

async function ownerCookie(base: string, code: string, password: string): Promise<string> {
  const setup = await fetch(`${base}/api/setup`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ code, password }),
  });

  const [first] = setup.headers.getSetCookie();

  if (setup.status !== 204 || first === undefined) {
    throw new Error(`Setup answered ${String(setup.status)} with no session cookie.`);
  }

  return first.split(";")[0] ?? "";
}

async function call(
  base: string,
  cookie: string,
  method: string,
  path: string,
  body: Json | undefined,
): Promise<Json> {
  const init: RequestInit = {
    method,
    headers: { cookie, "content-type": "application/json", origin: base },
  };

  if (body !== undefined) init.body = JSON.stringify(body);
  const response = await fetch(`${base}${path}`, init);

  if (!response.ok) throw new Error(`${method} ${path} answered ${String(response.status)}.`);

  return response.status === 204 ? null : AnswerSchema.parse(await response.json());
}

export async function startInstance(
  root: string,
  scratch: string,
  held: Resources,
): Promise<Instance> {
  const code = randomBytes(16).toString("hex");
  const password = randomBytes(16).toString("hex");
  const port = await freePort();
  const base = `http://127.0.0.1:${String(port)}`;
  const server = held.own(spawnServer(root, scratch, port, code), (running) => running.stop());

  await waitForSession(base, server, Date.now() + SESSION_WAIT_MS);
  const cookie = await ownerCookie(base, code, password);

  return { base, cookie, send: (method, path, body) => call(base, cookie, method, path, body) };
}
