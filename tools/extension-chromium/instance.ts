import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:net";

import { z } from "zod";

import { pause as sleep } from "../../src/core/pause.ts";
import { CommandFailure } from "../command-failure.ts";
import { PAGE_MARKDOWN, REDDIT_HOST } from "./stand-in.ts";

const CONTAINER = "threadsift-extension-chromium";

const UNROUTABLE_DNS = "192.0.2.1";

export interface Instance {
  readonly origin: string;
  readonly token: string;
  readonly password: string;
  readonly stop: () => void;
  readonly logs: () => string;
}

const StateSchema = z.object({ state: z.string() });

const ItemSchema = z.object({
  fillable: z.boolean(),
  status: z.string(),
  commentCount: z.object({ shown: z.number(), total: z.number() }).nullable(),
});

const ItemsSchema = z.object({ items: z.array(ItemSchema) });

const PortSchema = z.object({ port: z.number() });

export type ItemView = z.infer<typeof ItemSchema>;

function fail(reason: string, recovery: string): never {
  throw new CommandFailure({ kind: "check", reason, recovery });
}

function imageName(): string {
  const configured = process.env["THREADSIFT_IMAGE"];

  if (configured !== undefined) return configured;

  const root = process.env["DEVENV_ROOT"] ?? process.cwd();
  const slot = createHash("sha256").update(root).digest("hex").slice(0, 12);

  return `localhost/threadsift:smoke-${slot}`;
}

export function freePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = PortSchema.parse(probe.address());

      probe.close(() => {
        resolve(port);
      });
    });
  });
}

async function waitForInstance(origin: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- one poll at a time until the Instance answers.
    const answered = await fetch(`${origin}/api/session`).catch(() => null);

    if (answered?.ok === true) return;

    // oxlint-disable-next-line eslint/no-await-in-loop -- one poll at a time until the Instance answers.
    await sleep(500);
  }

  fail("the Instance did not answer", "read the container log with podman logs");
}

async function call(origin: string, path: string, init: RequestInit): Promise<Response> {
  const response = await fetch(`${origin}${path}`, { ...init, redirect: "manual" });

  if (!response.ok) {
    fail(`${init.method ?? "GET"} ${path} answered ${response.status}`, "check the Instance");
  }

  return response;
}

function post(body: string, extra: Readonly<Record<string, string>> = {}): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json", ...extra },
    body,
  };
}

function runContainer(port: number, code: string): void {
  const image = imageName();

  if (spawnSync("podman", ["image", "exists", image]).status !== 0) {
    fail(`the image ${image} does not exist`, "run devenv tasks run container:build");
  }

  spawnSync("podman", ["rm", "-f", CONTAINER], { stdio: "ignore" });
  execFileSync(
    "podman",
    [
      "run",
      "-d",
      "--rm",
      "--name",
      CONTAINER,
      "--dns",
      UNROUTABLE_DNS,
      "--publish",
      `127.0.0.1:${port}:8080`,
      "--env",
      "SETUP_CODE",
      "--env",
      "THREADSIFT_SECRET_KEY",
      image,
    ],
    {
      env: {
        ...process.env,
        SETUP_CODE: code,
        THREADSIFT_SECRET_KEY: randomBytes(32).toString("hex"),
      },
      stdio: "ignore",
    },
  );
}

async function createOwner(origin: string, code: string, password: string): Promise<string> {
  await call(origin, "/api/setup/code", post(JSON.stringify({ code })));

  const setup = await call(origin, "/api/setup", post(JSON.stringify({ code, password })));
  const cookie = setup.headers.getSetCookie()[0]?.split(";")[0] ?? "";

  const body = JSON.stringify({ name: "chromium run", scopes: ["read", "add", "reddit"] });
  const created = await call(origin, "/api/tokens", post(body, { cookie }));

  return z.object({ value: z.string() }).parse(await created.json()).value;
}

function stop(): void {
  spawnSync("podman", ["rm", "-f", CONTAINER], { stdio: "ignore" });
}

export async function startInstance(): Promise<Instance> {
  const port = await freePort();
  const code = randomBytes(24).toString("base64url");
  const password = `a password of ${randomBytes(12).toString("hex")}`;
  const origin = `http://127.0.0.1:${port}`;

  runContainer(port, code);

  try {
    await waitForInstance(origin);

    const token = await createOwner(origin, code, password);

    return {
      origin,
      token,
      password,
      stop,
      logs: () => execFileSync("podman", ["logs", CONTAINER], { encoding: "utf8" }),
    };
  } catch (cause) {
    stop();
    throw cause;
  }
}

function authorized({ token }: Readonly<Instance>) {
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
}

export async function accountState(instance: Readonly<Instance>): Promise<string> {
  const headers = authorized(instance);
  const answer = await call(instance.origin, "/api/reddit-account", { headers });

  return StateSchema.parse(await answer.json()).state;
}

export async function disconnectAccount(instance: Readonly<Instance>): Promise<void> {
  const headers = authorized(instance);
  await call(instance.origin, "/api/reddit-account", { method: "DELETE", headers });
}

export function threadLink(postId: string): string {
  return `https://${REDDIT_HOST}/r/synthetic/comments/${postId}/synthetic_thread/`;
}

export async function itemOf(
  instance: Readonly<Instance>,
  postId: string,
): Promise<ItemView | null> {
  const query = new URLSearchParams({ url: threadLink(postId) });
  const headers = authorized(instance);
  const answer = await call(instance.origin, `/api/items?${query.toString()}`, { headers });

  return ItemsSchema.parse(await answer.json()).items[0] ?? null;
}

export async function seedItem(
  instance: Readonly<Instance>,
  postId: string,
): Promise<ItemView | null> {
  const page = { markdown: PAGE_MARKDOWN, title: `Synthetic thread ${postId}` };
  const body = JSON.stringify({ url: threadLink(postId), page });

  await call(instance.origin, "/api/items", { ...post(body), headers: authorized(instance) });

  return itemOf(instance, postId);
}
