import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import type { z } from "zod";

import { createApp } from "../src/http/app.ts";
import { ItemDetailResponseSchema, ItemResponseSchema } from "../src/http/schemas.ts";
import { openDatabase } from "../src/targets/node/database.ts";
import { startNode } from "../src/targets/node/ports.ts";

export const SETUP_CODE = "a-setup-code-of-sixteen-or-more";

export const PASSWORD = "an owner password of fifteen or more";

const MIGRATIONS = join(import.meta.dirname, "..", "migrations");

const POLL_MS = 25;

const SETTLE_DEADLINE_MS = 20_000;

const ORIGIN = "http://localhost";

const SESSION_COOKIE = "__Host-threadsift_session";

export type Json =
  | string
  | number
  | boolean
  | null
  | readonly Json[]
  | { readonly [key: string]: Json };

export interface Answer {
  readonly status: number;
  readonly body: string;
}

async function settled<Value>(
  read: () => Promise<Value>,
  isDone: (value: Value) => boolean,
  deadline: number,
): Promise<Value> {
  const value = await read();

  if (isDone(value)) return value;

  if (Date.now() >= deadline) throw new Error("the state did not settle before its deadline");

  await delay(POLL_MS);

  return settled(read, isDone, deadline);
}

function sessionPair(response: Readonly<Response>): string | null | undefined {
  const header = response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));

  if (header === undefined) return undefined;

  const [pair = ""] = header.split(";");

  return pair === `${SESSION_COOKIE}=` ? null : pair;
}

export class Instance {
  private cookie: string | null = null;
  private readonly app: ReturnType<typeof createApp>;
  private readonly shutdown: () => Promise<void>;

  private readonly folder: string;

  private constructor(
    app: ReturnType<typeof createApp>,
    folder: string,
    shutdown: () => Promise<void>,
  ) {
    this.app = app;
    this.folder = folder;
    this.shutdown = shutdown;
  }

  static async start(publicOrigin?: string): Promise<Instance> {
    const folder = await mkdtemp(join(tmpdir(), "threadsift-test-"));
    const database = openDatabase(join(folder, "threadsift.db"), MIGRATIONS);

    const node = await startNode(database.db, {
      dataDir: join(folder, "data"),
      setupCode: SETUP_CODE,
      secretKey: undefined,
      resetCode: undefined,
      publicOrigin,
      claude: { path: "", configDir: undefined, token: undefined },
      codex: { path: "", home: undefined, dataDir: join(folder, "data") },
    });

    return new Instance(createApp(node.ports), folder, async () => {
      await node.stop();
      database.close();
      await rm(folder, { recursive: true });
    });
  }

  fetch(input: Request | string, init?: RequestInit): Promise<Response> {
    return Promise.resolve(this.app.request(input, init));
  }

  get sessionCookie(): string | null {
    return this.cookie;
  }

  get databaseFile(): string {
    return join(this.folder, "threadsift.db");
  }

  close(): Promise<void> {
    return this.shutdown();
  }

  async send(method: string, path: string, body: Json = null): Promise<Answer> {
    const headers = new Headers({ origin: ORIGIN });
    const init: RequestInit = { method, headers };

    if (body !== null) {
      headers.set("content-type", "application/json");
      init.body = JSON.stringify(body);
    }

    if (this.cookie !== null) headers.set("cookie", this.cookie);

    const response = await this.app.request(path, init);

    const session = sessionPair(response);

    if (session !== undefined) this.cookie = session;

    return { status: response.status, body: await response.text() };
  }

  async read<Schema extends z.ZodType>(
    method: string,
    path: string,
    schema: Schema,
    body: Json = null,
  ): Promise<z.infer<Schema>> {
    const answer = await this.send(method, path, body);

    return schema.parse(JSON.parse(answer.body));
  }

  async setUp(): Promise<void> {
    await this.send("POST", "/api/setup", { code: SETUP_CODE, password: PASSWORD });
  }

  async settledItem(id: number) {
    const { item } = await settled(
      () => this.read("GET", `/api/items/${String(id)}/status`, ItemResponseSchema),
      ({ item: current }) => current.status !== "processing",
      Date.now() + SETTLE_DEADLINE_MS,
    );

    return item;
  }

  async detail(id: number) {
    const { item } = await this.read("GET", `/api/items/${String(id)}`, ItemDetailResponseSchema);

    return item;
  }
}
