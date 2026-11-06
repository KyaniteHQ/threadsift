import { setTimeout as sleep } from "node:timers/promises";

import type { z } from "zod";

import {
  ItemResponseSchema,
  ItemListResponseSchema,
  SavedItemResponseSchema,
  SessionStateSchema,
} from "../../src/http/schemas.ts";
import type { AccessCodes } from "./codes.ts";
import { type Copy, POLL_MS, callCopy, isJson, refusal } from "./copy-calls.ts";
import { signIn } from "./demo-access.ts";
import { callTimeout } from "./timeout.ts";

const SERVE_DEADLINE_MS = 120_000;
const RETRY_BUDGET_MS = 120_000;
const SERVED_IN_A_ROW = 10;
const ITEM_DEADLINE_MS = 300_000;

type Item = z.infer<typeof ItemResponseSchema>["item"];

const CHECKED_FIELDS = ["status", "source", "title", "fetch"] as const;

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

async function paste(copy: Readonly<Copy>, link: string): Promise<number> {
  process.stdout.write(`Paste ${link}\n`);

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

  await expectOk(response, path);

  const { item } = ItemResponseSchema.parse(await response.json());

  if (item.status !== "processing") return item;

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

export async function seedDemo(url: string, codes: Readonly<AccessCodes>): Promise<void> {
  const copy = await openDemo(url, codes);

  const outcomes = await Promise.all(DEMO_ITEMS.map((demo) => seedItem(copy, demo)));
  const failed = outcomes.filter((outcome) => outcome !== null);

  if (failed.length > 0) {
    throw new Error(`Demo data did not reach its end state: ${failed.join("; ")}`);
  }
}

async function openDemo(url: string, codes: Readonly<AccessCodes>): Promise<Copy> {
  await awaitServing(url);

  return signIn({ url, retryUntil: Date.now() + RETRY_BUDGET_MS }, codes);
}

export async function ensureDemo(url: string, codes: Readonly<AccessCodes>): Promise<void> {
  const copy = await openDemo(url, codes);
  const response = await callCopy(copy, { path: "/api/items", cookie: copy.cookie });

  await expectOk(response, "/api/items");
  const { items } = ItemListResponseSchema.parse(await response.json());

  await Promise.all(
    DEMO_ITEMS.map(async (demo) => {
      const existing = items.find((item) => item.originalUrl === demo.url);

      if (existing === undefined) {
        await endState(copy, await paste(copy, demo.url));
      } else if (existing.status === "processing") {
        await endState(copy, existing.id);
      }
    }),
  );

  const session = await callCopy(copy, { path: "/api/session", cookie: copy.cookie });

  await expectOk(session, "/api/session");

  if (SessionStateSchema.parse(await session.json()).state !== "signed-in")
    throw new Error("Live signed-in session check failed");
  process.stdout.write("Live signed-in GET /api/session passed\n");
}

async function expectOk(response: Response, path: string): Promise<void> {
  if (response.status !== 200)
    throw new Error(`${path} answered ${String(response.status)}: ${await refusal(response)}`);
}
