import { setTimeout as sleep } from "node:timers/promises";

import type { z } from "zod";

import { ItemResponseSchema, SavedItemResponseSchema } from "../../src/http/schemas.ts";
import { type Copy, POLL_MS, type Site, callCopy, isJson, refusal } from "./copy-calls.ts";
import { callTimeout } from "./timeout.ts";

const SERVE_DEADLINE_MS = 120_000;
const SERVED_IN_A_ROW = 10;
const ITEM_DEADLINE_MS = 300_000;

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

export async function expectOk(response: Response, path: string): Promise<void> {
  if (response.status !== 200) {
    throw new CopyAnswerError(path, response.status, await refusal(response));
  }
}

export async function logIn(site: Readonly<Site>, password: string): Promise<Copy> {
  const path = "/api/login";
  const response = await callCopy(site, { path, body: { password } });
  const [setCookie] = response.headers.getSetCookie();
  const cookie = setCookie?.split(";")[0];

  if (response.status !== 204 || cookie === undefined) {
    throw new CopyAnswerError(path, response.status, await refusal(response));
  }

  return { ...site, cookie };
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
