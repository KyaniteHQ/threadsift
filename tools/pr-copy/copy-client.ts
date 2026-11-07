import type { z } from "zod";

import { ItemResponseSchema, SavedItemResponseSchema } from "../../src/http/schemas.ts";
import {
  type Copy,
  POLL_MS,
  type Site,
  callCopy,
  isJson,
  refusal,
  sessionCookie,
} from "./copy-calls.ts";
import { CopyAnswerError } from "./copy-error.ts";
import { callTimeout, pause } from "./timeout.ts";

const SERVE_DEADLINE_MS = 120_000;
const SERVED_IN_A_ROW = 10;
const ITEM_DEADLINE_MS = 300_000;

export type Item = z.infer<typeof ItemResponseSchema>["item"];

async function answersJson(url: string, deadline: number): Promise<boolean> {
  const response = await fetch(`${url}/api/session`, { signal: callTimeout(deadline) }).catch(
    () => null,
  );

  if (response !== null && response.status >= 500 && isJson(response)) {
    throw new CopyAnswerError("/api/session", response.status, await refusal(response));
  }

  return response?.status === 200 && isJson(response);
}

export async function awaitServing(
  url: string,
  deadline = Date.now() + SERVE_DEADLINE_MS,
  inARow = 0,
): Promise<void> {
  if (inARow >= SERVED_IN_A_ROW) {
    return;
  }

  if (Date.now() >= deadline) {
    throw new Error(`${url} did not serve the app before its deadline`);
  }

  const served = await answersJson(url, deadline);
  await pause(POLL_MS, deadline);

  return awaitServing(url, deadline, served ? inARow + 1 : 0);
}

export async function expectOk(response: Response, path: string): Promise<void> {
  if (response.status !== 200) {
    throw new CopyAnswerError(path, response.status, await refusal(response));
  }
}

export async function logIn(site: Readonly<Site>, password: string): Promise<Copy> {
  const path = "/api/login";
  const response = await callCopy(site, { path, body: { password } });
  const cookie = sessionCookie(response);

  if (response.status !== 204 || cookie === undefined) {
    throw new CopyAnswerError(path, response.status, await refusal(response));
  }

  return { ...site, cookie };
}

export async function paste(
  copy: Readonly<Copy>,
  link: string,
): Promise<{ id: number; created: boolean }> {
  process.stdout.write(`Paste ${link}\n`);

  const response = await callCopy(copy, {
    path: "/api/items",
    cookie: copy.cookie,
    body: { url: link },
  });

  if (response.status !== 200 && response.status !== 201) {
    throw new CopyAnswerError("/api/items", response.status, await refusal(response));
  }

  const { item } = SavedItemResponseSchema.parse(await response.json());

  return { id: item.id, created: response.status === 201 };
}

export async function endState(
  copy: Readonly<Copy>,
  id: number,
  deadline = Date.now() + ITEM_DEADLINE_MS,
): Promise<Item> {
  const path = `/api/items/${String(id)}/status`;
  const response = await callCopy(copy, { path, cookie: copy.cookie, deadline });

  await expectOk(response, path);

  const { item } = ItemResponseSchema.parse(await response.json());

  if (item.status !== "processing") return item;

  if (Date.now() >= deadline) {
    throw new Error(`Item ${String(id)} is still processing at its deadline`);
  }

  await pause(POLL_MS, deadline);

  return endState(copy, id, deadline);
}
