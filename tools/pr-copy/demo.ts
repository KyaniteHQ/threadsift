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
const RETRY_BUDGET_MS = 120_000;
const SERVED_IN_A_ROW = 10;
const LOCK_WAIT_LIMIT_S = 300;
const ITEM_DEADLINE_MS = 300_000;
const POLL_MS = 1000;
const CHECKED_FIELDS = ["status", "source", "title", "fetch"] as const;

type Item = z.infer<typeof ItemResponseSchema>["item"];

interface DemoItem {
  readonly url: string;
  readonly expected: Readonly<Partial<Pick<Item, (typeof CHECKED_FIELDS)[number]>>>;
}

const DEMO_ITEMS: readonly DemoItem[] = [
  {
    url: "https://stephango.com/saw",
    expected: { status: "ready", source: "article", fetch: "ok" },
  },
  {
    url: "https://matklad.github.io/2023/10/12/lsp-could-have-been-better.html",
    expected: { status: "ready", source: "article", fetch: "ok" },
  },
  {
    url: "https://example.com/",
    expected: { status: "ready", source: "other", title: "Example Domain", fetch: "ok" },
  },
  {
    url: "https://threadsift-demo.invalid/",
    expected: { status: "failed", title: null, fetch: "network" },
  },
];

interface Site {
  readonly url: string;
  readonly retryUntil: number;
}

interface Copy extends Site {
  readonly cookie: string;
}

interface Call {
  readonly path: string;
  readonly cookie?: string;
  readonly body?: Readonly<Record<string, string>>;
}

function send(url: string, call: Readonly<Call>): Promise<Response> {
  const headers = new Headers({ origin: url });

  if (call.cookie !== undefined) {
    headers.set("cookie", call.cookie);
  }

  if (call.body === undefined) {
    return fetch(`${url}${call.path}`, { headers, signal: callTimeout() });
  }

  headers.set("content-type", "application/json");

  return fetch(`${url}${call.path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(call.body),
    signal: callTimeout(),
  });
}

function isJson(response: Response): boolean {
  return (response.headers.get("content-type") ?? "").startsWith("application/json");
}

function fromApp(response: Response): boolean {
  return (response.status !== 404 && response.status < 500) || isJson(response);
}

async function callCopy(site: Readonly<Site>, call: Readonly<Call>): Promise<Response> {
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

async function awaitServing(url: string, inARow = 0, waitedMs = 0): Promise<void> {
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
    throw new Error(`${call.path} answered ${String(response.status)}: ${await refusal(response)}`);
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

async function logIn(site: Readonly<Site>, password: string): Promise<Copy> {
  const cookie = await postAccess(site, { path: "/api/login", body: { password } });

  if (cookie === null) {
    throw new Error("/api/login answered 409");
  }

  return { ...site, cookie };
}

async function signIn(site: Readonly<Site>, setupCode: string): Promise<Copy> {
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

async function paste(copy: Readonly<Copy>, link: string): Promise<number> {
  const response = await callCopy(copy, {
    path: "/api/items",
    cookie: copy.cookie,
    body: { url: link },
  });

  if (response.status !== 200 && response.status !== 201) {
    throw new Error(
      `Paste of ${link} answered ${String(response.status)}: ${await refusal(response)}`,
    );
  }

  return SavedItemResponseSchema.parse(await response.json()).item.id;
}

async function endState(copy: Readonly<Copy>, id: number, waitedMs = 0): Promise<Item> {
  const path = `/api/items/${String(id)}/status`;
  const response = await callCopy(copy, { path, cookie: copy.cookie });

  if (response.status !== 200) {
    throw new Error(`${path} answered ${String(response.status)}: ${await refusal(response)}`);
  }

  const { item } = ItemResponseSchema.parse(await response.json());

  if (item.status !== "processing") {
    return item;
  }

  if (waitedMs >= ITEM_DEADLINE_MS) {
    throw new Error(`Item ${String(id)} is still processing after ${String(ITEM_DEADLINE_MS)} ms`);
  }

  await sleep(POLL_MS);

  return endState(copy, id, waitedMs + POLL_MS);
}

function misses(item: Readonly<Item>, expected: DemoItem["expected"]): string[] {
  return CHECKED_FIELDS.filter(
    (field) => expected[field] !== undefined && item[field] !== expected[field],
  );
}

async function seedItem(copy: Readonly<Copy>, demo: Readonly<DemoItem>): Promise<string | null> {
  const id = await paste(copy, demo.url);
  const item = await endState(copy, id);
  const wrong = misses(item, demo.expected);
  process.stdout.write(`Item ${String(id)} ${demo.url}: ${JSON.stringify(item)}\n`);

  return wrong.length === 0 ? null : `${demo.url} ended with a different ${wrong.join(", ")}`;
}

export async function seedDemo(url: string, setupCode: string): Promise<void> {
  await awaitServing(url);

  const copy = await signIn({ url, retryUntil: Date.now() + RETRY_BUDGET_MS }, setupCode);
  const outcomes = await Promise.all(DEMO_ITEMS.map((demo) => seedItem(copy, demo)));
  const failed = outcomes.filter((outcome) => outcome !== null);

  if (failed.length > 0) {
    throw new Error(`Demo data did not reach its end state: ${failed.join("; ")}`);
  }
}
