import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  request,
} from "@playwright/test";
import { z } from "zod";

import { SESSION_DAYS } from "../src/core/sessions.ts";

export const SESSION_COOKIE = "__Host-threadsift_session";

const StorageStateSchema = z.object({
  cookies: z.array(
    z.object({
      name: z.string(),
      value: z.string(),
      domain: z.string(),
      path: z.string(),
      expires: z.number(),
      httpOnly: z.boolean(),
      secure: z.boolean(),
      sameSite: z.enum(["Strict", "Lax", "None"]),
    }),
  ),
  origins: z.tuple([]),
});

const TokenFileSchema = z.object({ value: z.string() });

const PasswordFileSchema = z.object({ password: z.string() });

export type StorageState = z.infer<typeof StorageStateSchema>;

export function stateDir(): string {
  const dir = process.env["THREADSIFT_E2E_DIR"];

  if (dir === undefined) {
    throw new Error("Set THREADSIFT_E2E_DIR; tools/e2e/container.sh and tools/e2e/worker.sh do");
  }

  return dir;
}

function readState<T>(name: string, schema: z.ZodType<T>): T {
  return schema.parse(JSON.parse(readFileSync(join(stateDir(), name), "utf8")));
}

export const OWNER_STATE_FILE = "owner.json";
export const TOKEN_FILE = "token.json";
export const PASSWORD_FILE = "password.json";

export function ownerState(): StorageState {
  return readState(OWNER_STATE_FILE, StorageStateSchema);
}

export function agentToken(): string {
  return readState(TOKEN_FILE, TokenFileSchema).value;
}

export function ownerPassword(): string {
  return readState(PASSWORD_FILE, PasswordFileSchema).password;
}

export function newPassword(): string {
  return randomBytes(18).toString("base64url");
}

export function newCode(): string {
  return randomBytes(24).toString("base64url");
}

export function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

export function anonymous(baseURL: string): Promise<APIRequestContext> {
  return request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
}

export function ownerContext(
  browser: Browser,
  extra: Parameters<Browser["newContext"]>[0] = {},
): Promise<BrowserContext> {
  return browser.newContext({ storageState: ownerState(), ...extra });
}

export function sessionStateOf(value: string, baseURL: string): StorageState {
  const url = new URL(baseURL);

  return {
    cookies: [
      {
        name: SESSION_COOKIE,
        value,
        domain: url.hostname,
        path: "/",
        expires: Math.floor(Date.now() / 1000) + SESSION_DAYS * 86_400,
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      },
    ],
    origins: [],
  };
}

export function sessionValueOf(setCookie: string): string {
  const match = new RegExp(`${SESSION_COOKIE}=([^;]+)`, "u").exec(setCookie);

  if (match?.[1] === undefined) {
    throw new Error("The response set no session cookie");
  }

  return match[1];
}

export interface Instance {
  readonly url: string;
  readonly appExec: string;
  restart(): void;
  logs(): string;
  sql(statement: string): void;
  query<T>(statement: string, schema: z.ZodType<T>): T;
  stop(): void;
}

function instanceScript(): string[] {
  const script = process.env["THREADSIFT_INSTANCE_SCRIPT"];

  if (script === undefined) {
    throw new Error("Set THREADSIFT_INSTANCE_SCRIPT; the target scripts do");
  }

  return script.split(" ");
}

function runInstance(args: readonly string[], code: string | null): string {
  const [command = "", ...head] = instanceScript();
  const { SETUP_CODE: _inherited, ...env } = process.env;

  return execFileSync(command, [...head, ...args], {
    env: code === null ? env : { ...env, SETUP_CODE: code },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

export function instanceAt(dir: string): Instance {
  return {
    url: readFileSync(join(dir, "url"), "utf8").trim(),
    appExec: existsSync(join(dir, "exec")) ? readFileSync(join(dir, "exec"), "utf8").trim() : "",
    restart: () => {
      runInstance(["restart", dir], null);
    },
    logs: () => runInstance(["logs", dir], null),
    sql: (statement) => {
      runInstance(["sql", dir, statement], null);
    },
    query: (statement, schema) =>
      schema.parse(JSON.parse(runInstance(["query", dir, statement], null))),
    stop: () => {
      runInstance(["stop", dir], null);
    },
  };
}

export function mainInstance(): Instance {
  return instanceAt(stateDir());
}

let launched = 0;

export function launchFresh(code: string | null): Instance {
  launched += 1;
  const dir = join(stateDir(), `fresh-${launched}-${randomBytes(3).toString("hex")}`);
  mkdirSync(dir, { recursive: true });
  runInstance(["launch", dir], code);

  return instanceAt(dir);
}
