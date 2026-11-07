import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  test as base,
  request,
} from "@playwright/test";
import { z } from "zod";

import { envValue } from "./env.ts";

export const SESSION_COOKIE = "__Host-threadsift_session";
export const MAX_AGE = 2_592_000;

type StorageStateObject = Exclude<NonNullable<BrowserContextOptions["storageState"]>, string>;

export function stateDir(): string {
  return envValue("THREADSIFT_E2E_DIR");
}

function readText(name: string): string {
  return readFileSync(join(stateDir(), name), "utf8").trim();
}

export const OWNER_STATE_FILE = "owner.json";
export const TOKEN_FILE = "token.txt";
export const PASSWORD_FILE = "password.txt";

export function agentToken(): string {
  return readText(TOKEN_FILE);
}

export function ownerPassword(): string {
  return readText(PASSWORD_FILE);
}

const MINIMUM_PASSWORD_LENGTH = 15;

export function newPassword(): string {
  return randomBytes(18).toString("base64url");
}

export function minimumPassword(): string {
  return newPassword().slice(0, MINIMUM_PASSWORD_LENGTH);
}

export function newCode(): string {
  return randomBytes(24).toString("base64url");
}

export const SAME_ORIGIN = { "sec-fetch-site": "same-origin" } as const;

export function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

export const SIGNED_OUT = { cookies: [], origins: [] };

export function anonymous(baseURL: string): Promise<APIRequestContext> {
  return request.newContext({ baseURL, storageState: SIGNED_OUT });
}

export const test = base.extend<{ stranger: APIRequestContext }>({
  stranger: async ({ baseURL }, provide) => {
    const context = await anonymous(baseURL ?? "");
    await provide(context);
    await context.dispose();
  },
});

export function strangerPool() {
  const open: APIRequestContext[] = [];

  return {
    async at(url: string): Promise<APIRequestContext> {
      const context = await anonymous(url);
      open.push(context);

      return context;
    },
    async disposeAll(): Promise<void> {
      await Promise.all(open.splice(0).map((context) => context.dispose()));
    },
  };
}

export function ownerContext(
  browser: Browser,
  extra: Parameters<Browser["newContext"]>[0] = {},
): Promise<BrowserContext> {
  return browser.newContext({ storageState: join(stateDir(), OWNER_STATE_FILE), ...extra });
}

export function sessionStateOf(value: string, baseURL: string): StorageStateObject {
  const url = new URL(baseURL);

  return {
    cookies: [
      {
        name: SESSION_COOKIE,
        value,
        domain: url.hostname,
        path: "/",
        expires: Math.floor(Date.now() / 1000) + MAX_AGE,
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

export type InstanceEnv = Readonly<Record<string, string>>;

const MISSING_FILE_STATUS = 3;

const MAX_FILE_BYTES = 64 * 1024 * 1024;

const StoredFiles = z.array(
  z.object({ key: z.string(), size: z.number(), uploadedAt: z.number() }),
);

export type StoredFileInfo = z.infer<typeof StoredFiles>[number];

export interface Instance {
  readonly url: string;
  readonly appExec: string;
  restart(env?: InstanceEnv): void;
  crash(): void;
  logs(): string;
  sql(statement: string): void;
  query<T>(statement: string, schema: z.ZodType<T>): T;
  readFile(key: string): Buffer | null;
  writeFile(key: string, bytes: Uint8Array): void;
  listFiles(prefix: string): StoredFileInfo[];
  stop(): void;
}

function instanceScript(): string[] {
  return envValue("THREADSIFT_INSTANCE_SCRIPT").split(" ");
}

function runInstance(
  args: readonly string[],
  code: string | null,
  extra: InstanceEnv = {},
  input?: Uint8Array,
): Buffer {
  const [command = "", ...head] = instanceScript();
  const { SETUP_CODE: _setup, PASSWORD_RESET_CODE: _reset, ...env } = process.env;

  return execFileSync(command, [...head, ...args], {
    env: code === null ? { ...env, ...extra } : { ...env, ...extra, SETUP_CODE: code },
    maxBuffer: MAX_FILE_BYTES,
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "inherit"],
    input,
  });
}

export function instanceAt(dir: string): Instance {
  return {
    url: readFileSync(join(dir, "url"), "utf8").trim(),
    appExec: existsSync(join(dir, "exec")) ? readFileSync(join(dir, "exec"), "utf8").trim() : "",
    restart: (restartEnv) => {
      if (restartEnv === undefined) runInstance(["restart", dir], null);
      else {
        const file = join(dir, "restart.env");
        const lines = Object.entries(restartEnv).map(([name, value]) => `${name}=${value}\n`);
        writeFileSync(file, lines.join(""), { mode: 0o600 });
        runInstance(["restart", dir, file], null);
      }
    },
    crash: () => {
      runInstance(["crash", dir], null);
    },
    logs: () => runInstance(["logs", dir], null).toString("utf8"),
    sql: (statement) => {
      runInstance(["sql", dir, statement], null);
    },
    query: (statement, schema) =>
      schema.parse(JSON.parse(runInstance(["query", dir, statement], null).toString("utf8"))),
    readFile: (key) => {
      try {
        return runInstance(["file-read", dir, key], null);
      } catch (error) {
        if (error instanceof Error && "status" in error && error.status === MISSING_FILE_STATUS) {
          return null;
        }

        throw error;
      }
    },
    writeFile: (key, bytes) => {
      runInstance(["file-write", dir, key], null, {}, bytes);
    },
    listFiles: (prefix) =>
      StoredFiles.parse(JSON.parse(runInstance(["file-list", dir, prefix], null).toString("utf8"))),
    stop: () => {
      runInstance(["stop", dir], null);
    },
  };
}

export function mainInstance(): Instance {
  return instanceAt(stateDir());
}

let launched = 0;

export function launchAt(dir: string, code: string | null, extra: InstanceEnv = {}): Instance {
  mkdirSync(dir, { recursive: true });
  runInstance(["launch", dir], code, extra);

  return instanceAt(dir);
}

export function freshDir(): string {
  launched += 1;

  return join(stateDir(), `fresh-${launched}-${randomBytes(3).toString("hex")}`);
}

export function launchFresh(code: string | null, extra: InstanceEnv = {}): Instance {
  return launchAt(freshDir(), code, extra);
}
