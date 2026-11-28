import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { z } from "zod";

const SESSION_WAIT_MS = 30_000;

const SESSION_POLL_MS = 250;

const PASSWORD = "readme images owner password";

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

async function waitForSession(base: string, deadline: number): Promise<void> {
  if (await answers(base)) return;
  if (Date.now() > deadline) throw new Error("The Instance did not answer /api/session in time.");
  await delay(SESSION_POLL_MS);
  await waitForSession(base, deadline);
}

function spawnServer(root: string, port: number, code: string) {
  const dataDir = mkdtempSync(join(tmpdir(), "threadsift-readme-images-"));

  const child = spawn(process.execPath, ["src/targets/node/index.ts"], {
    cwd: root,
    stdio: "ignore",
    env: {
      PATH: process.env["PATH"],
      PORT: String(port),
      DATA_DIR: dataDir,
      SETUP_CODE: code,
      THREADSIFT_SECRET_KEY: randomBytes(32).toString("hex"),
    },
  });

  const stop = async () => {
    const done = new Promise<void>((resolve) => {
      child.once("exit", () => {
        resolve();
      });
    });

    child.kill("SIGTERM");
    await done;
    rmSync(dataDir, { recursive: true, force: true });
  };

  return stop;
}

async function ownerCookie(base: string, code: string): Promise<string> {
  const setup = await fetch(`${base}/api/setup`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ code, password: PASSWORD }),
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

export async function startInstance(root: string, port: number): Promise<Instance> {
  const code = randomBytes(16).toString("hex");
  const base = `http://127.0.0.1:${String(port)}`;
  const stop = spawnServer(root, port, code);

  await waitForSession(base, Date.now() + SESSION_WAIT_MS);
  const cookie = await ownerCookie(base, code);

  return {
    base,
    cookie,
    send: (method, path, body) => call(base, cookie, method, path, body),
    stop,
  };
}
