import { setTimeout as sleep } from "node:timers/promises";

import type { z } from "zod";

import {
  ErrorResponseSchema,
  ItemResponseSchema,
  SavedItemResponseSchema,
  SessionStateSchema,
} from "../../src/http/schemas.ts";
import { requiredEnv } from "./env.ts";
import { callTimeout } from "./timeout.ts";

const SERVE_DEADLINE_MS = 120_000;
const SERVED_IN_A_ROW = 10;
const LOCK_WAIT_LIMIT_S = 300;
const ITEM_DEADLINE_MS = 300_000;
const POLL_MS = 1000;

export type Item = z.infer<typeof ItemResponseSchema>["item"];

export class CopyAnswerError extends Error {
  readonly path: string;
  readonly status: number;
  readonly answer: string;

  constructor(path: string, status: number, answer: string) {
    super(`${path} answered ${String(status)}: ${answer}`);
    this.path = path;
    this.status = status;
    this.answer = answer;
  }
}

export interface Site {
  readonly url: string;
  readonly retryUntil: number;
}

export type Copy = Readonly<Site & { cookie: string }>;

export interface Call {
  readonly path: string;
  readonly cookie?: string;
  readonly body?: Readonly<Record<string, string>>;
}

export function send(url: string, call: Readonly<Call>): Promise<Response> {
  const headers = new Headers({ origin: url });

  if (call.cookie !== undefined) {
    headers.set("cookie", call.cookie);
  }

  const request =
    call.body === undefined
      ? { method: "GET" }
      : { method: "POST", body: JSON.stringify(call.body) };

  if (call.body !== undefined) headers.set("content-type", "application/json");

  return fetch(`${url}${call.path}`, { ...request, headers, signal: callTimeout() });
}

function isJson(response: Response): boolean {
  return (response.headers.get("content-type") ?? "").startsWith("application/json");
}

function fromApp(response: Response): boolean {
  return (response.status !== 404 && response.status < 500) || isJson(response);
}

export async function callCopy(site: Readonly<Site>, call: Readonly<Call>): Promise<Response> {
  const response = await send(site.url, call);

  if (fromApp(response) || Date.now() >= site.retryUntil) {
    return response;
  }

  await response.body?.cancel();
  process.stdout.write(
    `${call.path} got ${String(response.status)} from Cloudflare, not the app; retrying\n`,
  );
  await sleep(POLL_MS);

  return callCopy(site, call);
}

async function answersJson(url: string): Promise<boolean> {
  const response = await fetch(`${url}/api/session`, { signal: callTimeout() }).catch(() => null);

  return response?.status === 200 && isJson(response);
}

export async function awaitServing(url: string, inARow = 0, waitedMs = 0): Promise<void> {
  if (inARow >= SERVED_IN_A_ROW) {
    return;
  }

  if (waitedMs >= SERVE_DEADLINE_MS) {
    throw new Error(`${url} did not serve the app within ${String(SERVE_DEADLINE_MS)} ms`);
  }

  const served = await answersJson(url);
  await sleep(POLL_MS);

  return awaitServing(url, served ? inARow + 1 : 0, waitedMs + POLL_MS);
}

async function refusal(response: Response): Promise<string> {
  const body = ErrorResponseSchema.safeParse(await response.json().catch(() => null));

  return body.success ? body.data.error : "no error body";
}

export async function expectOk(response: Response, path: string): Promise<void> {
  if (response.status !== 200) {
    throw new CopyAnswerError(path, response.status, await refusal(response));
  }
}

async function postAccess(
  site: Readonly<Site>,
  call: Readonly<Call>,
  waitedS = 0,
): Promise<string | null> {
  const response = await callCopy(site, call);

  const [setCookie] = response.headers.getSetCookie();
  const cookie = setCookie?.split(";")[0];

  if (response.status === 204 && cookie !== undefined) {
    return cookie;
  }

  if (response.status === 409) {
    return null;
  }

  if (response.status !== 429) {
    throw new CopyAnswerError(call.path, response.status, await refusal(response));
  }

  const retryAfter = Number(response.headers.get("retry-after"));

  if (waitedS + retryAfter > LOCK_WAIT_LIMIT_S) {
    throw new Error(
      `${call.path} is locked for ${String(retryAfter)} s after ${String(waitedS)} s of waiting; the limit is ${String(LOCK_WAIT_LIMIT_S)} s`,
    );
  }

  process.stdout.write(`${call.path} is locked; waiting ${String(retryAfter)} s\n`);
  await sleep(retryAfter * 1000);

  return postAccess(site, call, waitedS + retryAfter);
}

export async function logIn(site: Readonly<Site>, password: string): Promise<Copy> {
  const cookie = await postAccess(site, { path: "/api/login", body: { password } });

  if (cookie === null) {
    throw new Error("/api/login answered 409");
  }

  return { ...site, cookie };
}

export async function signIn(site: Readonly<Site>, setupCode: string): Promise<Copy> {
  const response = await callCopy(site, { path: "/api/session" });
  const state = SessionStateSchema.parse(await response.json());
  const password = requiredEnv("DEMO_OWNER_PASSWORD");
  process.stdout.write(`${site.url}/api/session: ${JSON.stringify(state)}\n`);

  if (state.state !== "setup") {
    return logIn(site, password);
  }

  if (state.code !== "set") {
    throw new Error(`The copy has no usable setup code: ${state.code}`);
  }

  const cookie = await postAccess(site, {
    path: "/api/setup",
    body: { code: setupCode, password },
  });

  return cookie === null ? logIn(site, password) : { ...site, cookie };
}

export async function paste(copy: Readonly<Copy>, link: string): Promise<number> {
  process.stdout.write(`Paste ${link}\n`);

  const response = await callCopy(copy, {
    path: "/api/items",
    cookie: copy.cookie,
    body: { url: link },
  });

  if (response.status !== 200 && response.status !== 201) {
    throw new CopyAnswerError("/api/items", response.status, await refusal(response));
  }

  return SavedItemResponseSchema.parse(await response.json()).item.id;
}

export async function endState(copy: Readonly<Copy>, id: number, waitedMs = 0): Promise<Item> {
  const path = `/api/items/${String(id)}/status`;
  const response = await callCopy(copy, { path, cookie: copy.cookie });

  await expectOk(response, path);

  const { item } = ItemResponseSchema.parse(await response.json());

  if (item.status !== "processing") return item;

  if (waitedMs >= ITEM_DEADLINE_MS) {
    throw new Error(`Item ${String(id)} is still processing after ${String(ITEM_DEADLINE_MS)} ms`);
  }

  await sleep(POLL_MS);

  return endState(copy, id, waitedMs + POLL_MS);
}
