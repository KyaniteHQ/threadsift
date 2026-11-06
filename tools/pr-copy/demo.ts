import { setTimeout as sleep } from "node:timers/promises";

import type { z } from "zod";

import {
  ErrorResponseSchema,
  ItemResponseSchema,
  SavedItemResponseSchema,
  SessionStateSchema,
} from "../../src/http/schemas.ts";
import { requiredEnv } from "./env.ts";

const SERVE_DEADLINE_MS = 120_000;
const LOCK_WAIT_LIMIT_S = 300;
const ITEM_DEADLINE_MS = 300_000;
const POLL_MS = 2000;
const SESSION_COOKIE = /(?<cookie>__Host-threadsift_session=[^;]+)/u;
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
    expected: { status: "ready", title: null, fetch: "status" },
  },
];

interface Copy {
  readonly url: string;
  readonly cookie: string;
}

interface Call {
  readonly path: string;
  readonly cookie?: string;
  readonly body?: Readonly<Record<string, string>>;
}

function isAppAnswer(response: Response): boolean {
  if (response.status >= 500) {
    return false;
  }

  return (
    response.status === 204 ||
    (response.headers.get("content-type") ?? "").startsWith("application/json")
  );
}

function requestInit(url: string, call: Readonly<Call>): RequestInit {
  const headers = new Headers({ origin: url });

  if (call.cookie !== undefined) {
    headers.set("cookie", call.cookie);
  }

  if (call.body === undefined) {
    return { headers };
  }

  headers.set("content-type", "application/json");

  return { method: "POST", headers, body: JSON.stringify(call.body) };
}

async function callCopy(url: string, call: Readonly<Call>, waitedMs = 0): Promise<Response> {
  const response = await fetch(`${url}${call.path}`, requestInit(url, call)).catch(() => null);

  if (response !== null && isAppAnswer(response)) {
    return response;
  }

  if (waitedMs >= SERVE_DEADLINE_MS) {
    throw new Error(
      `${call.path} got no answer from the app within ${String(SERVE_DEADLINE_MS)} ms; the last was ${String(response?.status)}`,
    );
  }

  process.stdout.write(`${call.path}: no answer from the app yet (${String(response?.status)})\n`);
  await sleep(POLL_MS);

  return callCopy(url, call, waitedMs + POLL_MS);
}

async function refusal(response: Response): Promise<string> {
  const body = ErrorResponseSchema.safeParse(await response.json().catch(() => null));

  return body.success ? body.data.error : "no error body";
}

type Access =
  | { readonly kind: "signed-in"; readonly cookie: string }
  | { readonly kind: "owner-exists" };

async function postAccess(url: string, call: Readonly<Call>, waitedS = 0): Promise<Access> {
  const response = await callCopy(url, call);
  const cookie = SESSION_COOKIE.exec(response.headers.get("set-cookie") ?? "")?.groups?.["cookie"];

  if (response.status === 204 && cookie !== undefined) {
    return { kind: "signed-in", cookie };
  }

  if (response.status === 409) {
    return { kind: "owner-exists" };
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

  return postAccess(url, call, waitedS + retryAfter);
}

async function logIn(url: string, password: string): Promise<Copy> {
  const access = await postAccess(url, { path: "/api/login", body: { password } });

  if (access.kind !== "signed-in") {
    throw new Error("/api/login answered 409");
  }

  return { url, cookie: access.cookie };
}

async function signIn(url: string, setupCode: string): Promise<Copy> {
  const response = await callCopy(url, { path: "/api/session" });
  const state = SessionStateSchema.parse(await response.json());
  const password = requiredEnv("DEMO_OWNER_PASSWORD");
  process.stdout.write(`${url}/api/session: ${JSON.stringify(state)}\n`);

  if (state.state !== "setup") {
    return logIn(url, password);
  }

  if (state.code !== "set") {
    throw new Error(`The copy has no usable setup code: ${state.code}`);
  }

  const access = await postAccess(url, {
    path: "/api/setup",
    body: { code: setupCode, password },
  });

  return access.kind === "signed-in" ? { url, cookie: access.cookie } : logIn(url, password);
}

async function paste(copy: Readonly<Copy>, link: string): Promise<number> {
  const response = await callCopy(copy.url, {
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
  const response = await callCopy(copy.url, { path, cookie: copy.cookie });

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
  const copy = await signIn(url, setupCode);
  const outcomes = await Promise.all(DEMO_ITEMS.map((demo) => seedItem(copy, demo)));
  const failed = outcomes.filter((outcome) => outcome !== null);

  if (failed.length > 0) {
    throw new Error(`Demo data did not reach its end state: ${failed.join("; ")}`);
  }
}
