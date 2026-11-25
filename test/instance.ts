import type { z } from "zod";

import { tick } from "../src/core/compose/tick.ts";
import {
  ItemDetailResponseSchema,
  ItemListResponseSchema,
  ItemResponseSchema,
} from "../src/core/contract/item-route-wire.ts";
import { hasOwner } from "../src/features/access/core/owner.ts";
import { prepareSession, sessionWrites } from "../src/features/access/core/sessions.ts";
import { createApp } from "../src/http/app.ts";
import { nodeEnvironment } from "../src/targets/node/environment.ts";
import { startNode } from "../src/targets/node/ports.ts";
import { databaseOf, instanceDatabase, snapshotDatabase } from "./instance-database.ts";
import { until } from "./library-fixtures.ts";

export const SETUP_CODE = "a-setup-code-of-sixteen-or-more";

export const PASSWORD = "an owner password of fifteen or more";

type Ports = Parameters<typeof createApp>[0];

interface StartOptions {
  readonly fresh?: boolean;
  readonly publicOrigin?: string | undefined;
  readonly fetchers?: string | undefined;
  readonly secretKey?: string | undefined;
  readonly resetCode?: string | undefined;
}

let ownerTemplate: Promise<Uint8Array> | undefined;

function templateDatabase(): Promise<Uint8Array> {
  ownerTemplate ??= buildOwnerTemplate().catch((cause: unknown) => {
    ownerTemplate = undefined;
    throw cause;
  });

  return ownerTemplate;
}

export const ORIGIN = "http://localhost";

export const SECRET_KEY = "0".repeat(64);

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
  private needsOwnerSession: boolean;
  private readonly app: ReturnType<typeof createApp>;
  private readonly shutdown: () => Promise<void>;

  readonly databaseFile: string;
  readonly database: ReturnType<typeof databaseOf>;
  private readonly ports: Ports;

  private constructor(
    app: ReturnType<typeof createApp>,
    ports: Ports,
    file: string,
    needsOwnerSession: boolean,
    shutdown: () => Promise<void>,
  ) {
    this.app = app;
    this.ports = ports;
    this.databaseFile = file;
    this.database = databaseOf(file);
    this.needsOwnerSession = needsOwnerSession;
    this.shutdown = shutdown;
  }

  static async start({
    fresh = false,
    publicOrigin,
    fetchers,
    secretKey,
    resetCode,
  }: StartOptions = {}): Promise<Instance> {
    const template = fresh ? undefined : await templateDatabase();
    await using cleanup = new AsyncDisposableStack();
    const database = cleanup.use(instanceDatabase(template));

    const environment = nodeEnvironment({
      DATA_DIR: database.dataDir,
      SETUP_CODE,
      PASSWORD_RESET_CODE: resetCode,
      THREADSIFT_SECRET_KEY: secretKey,
      THREADSIFT_PUBLIC_ORIGIN: publicOrigin,
      THREADSIFT_FETCHERS: fetchers,
    });

    const node = await startNode(database.db, environment);
    cleanup.defer(() => node.stop());
    const app = createApp(node.ports);
    const resources = cleanup.move();
    return new Instance(app, node.ports, database.file, !fresh, () => resources.disposeAsync());
  }

  fetch(input: Request | string, init?: RequestInit): Promise<Response> {
    return Promise.resolve(this.app.request(input, init));
  }

  get ownerCookie(): string {
    if (this.cookie === null) throw new Error("The Instance holds no session");

    return this.cookie;
  }

  private ownerHeaders(extra: HeadersInit = {}): Headers {
    const headers = new Headers({ origin: ORIGIN });

    for (const [name, value] of new Headers(extra)) headers.set(name, value);

    if (this.cookie !== null) headers.set("cookie", this.cookie);

    return headers;
  }

  request(path: string, init: RequestInit = {}): Promise<Response> {
    return this.fetch(path, { ...init, headers: this.ownerHeaders(init.headers) });
  }

  get routes() {
    return this.app.routes;
  }

  get core(): Ports {
    return this.ports;
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
    const response = await this.app.request(
      path,
      requestOf(method, this.ownerHeaders(extraHeaders), body),
    );

    const session = sessionPair(response);

    if (session !== undefined) this.cookie = session;

    return { status: response.status, body: await response.text() };
  }

  async sendWithPublicOnlyAiAndNoXFetcher(
    method: string,
    path: string,
    body: Json = null,
  ): Promise<Answer> {
    const worker = createApp({
      ...this.ports,
      ai: { ...this.ports.ai, publicOnly: true },
      xFetcher: null,
    });

    const response = await worker.request(path, requestOf(method, this.ownerHeaders(), body));

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

    if (answer.status < 200 || answer.status > 299) {
      throw new Error(`${method} ${path} answered ${String(answer.status)}`);
    }

    return schema.parse(JSON.parse(answer.body));
  }

  async setUp(): Promise<void> {
    if (this.needsOwnerSession) {
      const { crypto, db } = this.ports;
      if (!(await hasOwner(db))) throw new Error("The copied database has no owner");
      const session = prepareSession(crypto);
      await db.batch(sessionWrites(db, session));
      this.cookie = `${SESSION_COOKIE}=${session.id}`;
      this.needsOwnerSession = false;
      return;
    }

    await this.send("POST", "/api/setup", { code: SETUP_CODE, password: PASSWORD });
  }

  async settledItem(id: number) {
    const { item } = await until(
      `Item ${String(id)} has finished processing`,
      () => this.read("GET", `/api/items/${String(id)}/status`, ItemResponseSchema),
      ({ item: current }) => current.status !== "processing",
    );

    return item;
  }

  async itemTotal(): Promise<number> {
    return (await this.read("GET", "/api/items", ItemListResponseSchema)).counts.total;
  }

  async detail(id: number) {
    const { item } = await this.read("GET", `/api/items/${String(id)}`, ItemDetailResponseSchema);

    return item;
  }
}

async function buildOwnerTemplate(): Promise<Uint8Array> {
  await using cleanup = new AsyncDisposableStack();
  const seed = await Instance.start({ fresh: true });
  cleanup.defer(() => seed.close());
  await seed.setUp();

  if ((await seed.send("POST", "/api/logout")).status !== 204) {
    throw new Error("Owner setup did not produce a signed-in owner");
  }

  return await snapshotDatabase(seed.databaseFile);
}
