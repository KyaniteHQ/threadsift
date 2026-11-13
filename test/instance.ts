import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import type { z } from "zod";

import { tick } from "../src/core/tick.ts";
import { createApp } from "../src/http/app.ts";
import { ItemDetailResponseSchema, ItemResponseSchema } from "../src/http/schemas.ts";
import { openDatabase } from "../src/targets/node/database.ts";
import { startNode } from "../src/targets/node/ports.ts";

export const SETUP_CODE = "a-setup-code-of-sixteen-or-more";

export const PASSWORD = "an owner password of fifteen or more";

const MIGRATIONS = join(import.meta.dirname, "..", "migrations");

type Ports = Parameters<typeof createApp>[0];

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

function requestOf(method: string, headers: Headers, body: Json): RequestInit {
  if (body === null) return { method, headers };

  headers.set("content-type", "application/json");

  return { method, headers, body: JSON.stringify(body) };
}

export class Instance {
  private cookie: string | null = null;
  private readonly app: ReturnType<typeof createApp>;
  private readonly shutdown: () => Promise<void>;

  private readonly folder: string;
  private readonly ports: Ports;

  private constructor(
    app: ReturnType<typeof createApp>,
    ports: Ports,
    folder: string,
    shutdown: () => Promise<void>,
  ) {
    this.app = app;
    this.ports = ports;
    this.folder = folder;
    this.shutdown = shutdown;
  }

  static async start({
    publicOrigin,
    fetchers,
    secretKey,
    prepare,
  }: Readonly<{
    publicOrigin?: string | undefined;
    fetchers?: string | undefined;
    secretKey?: string | undefined;
    prepare?: ((databaseFile: string) => void) | undefined;
  }> = {}): Promise<Instance> {
    const folder = await mkdtemp(join(tmpdir(), "threadsift-test-"));
    const file = join(folder, "threadsift.db");

    prepare?.(file);

    const database = openDatabase(file, MIGRATIONS);

    const stop = async () => {
      database.close();
      await rm(folder, { recursive: true });
    };

    const node = await startNode(database.db, {
      dataDir: join(folder, "data"),
      setupCode: SETUP_CODE,
      secretKey,
      resetCode: undefined,
      publicOrigin,
      fetchers,
      claude: { path: "", configDir: undefined, token: undefined },
      codex: { path: "", home: undefined, dataDir: join(folder, "data") },
      grok: { path: "", home: undefined, dataDir: join(folder, "data") },
    }).catch(async (error: Error) => {
      await stop();

      throw error;
    });

    return new Instance(createApp(node.ports), node.ports, folder, async () => {
      await node.stop();
      await stop();
    });
  }

  fetch(input: Request | string, init?: RequestInit): Promise<Response> {
    return Promise.resolve(this.app.request(input, init));
  }

  get sessionCookie(): string | null {
    return this.cookie;
  }

  get core(): Ports {
    return this.ports;
  }

  get databaseFile(): string {
    return join(this.folder, "threadsift.db");
  }

  tick(): Promise<void> {
    return tick(this.ports);
  }

  close(): Promise<void> {
    return this.shutdown();
  }

  async send(
    method: string,
    path: string,
    body: Json = null,
    extraHeaders: Readonly<Record<string, string>> = {},
  ): Promise<Answer> {
    const headers = new Headers({ origin: ORIGIN, ...extraHeaders });

    if (this.cookie !== null) headers.set("cookie", this.cookie);

    const response = await this.app.request(path, requestOf(method, headers, body));

    const session = sessionPair(response);

    if (session !== undefined) this.cookie = session;

    return { status: response.status, body: await response.text() };
  }

  async readThrough<Schema extends z.ZodType>(
    db: Ports["db"],
    path: string,
    schema: Schema,
  ): Promise<z.infer<Schema>> {
    const response = await createApp({ ...this.ports, db }).request(path, {
      headers: new Headers({ origin: ORIGIN, cookie: this.cookie ?? "" }),
    });

    return schema.parse(JSON.parse(await response.text()));
  }

  async sendThrough(db: Ports["db"], method: string, path: string): Promise<Answer> {
    const response = await createApp({ ...this.ports, db }).request(path, {
      method,
      headers: new Headers({ origin: ORIGIN, cookie: this.cookie ?? "" }),
    });

    return { status: response.status, body: await response.text() };
  }

  async statusThrough(db: Ports["db"], method: string, path: string): Promise<number> {
    return (await this.sendThrough(db, method, path)).status;
  }

  async sendWithPublicOnlyAiAndNoXFetcher(
    method: string,
    path: string,
    body: Json = null,
  ): Promise<Answer> {
    const headers = new Headers({ origin: ORIGIN, cookie: this.cookie ?? "" });

    const worker = createApp({
      ...this.ports,
      ai: { ...this.ports.ai, publicOnly: true },
      xFetcher: null,
    });

    const response = await worker.request(path, requestOf(method, headers, body));

    return { status: response.status, body: await response.text() };
  }

  async sendWithToken(
    token: string,
    method: string,
    path: string,
    body: Json = null,
  ): Promise<Answer> {
    const headers = new Headers({ origin: ORIGIN, authorization: `Bearer ${token}` });

    const response = await this.app.request(path, requestOf(method, headers, body));

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
