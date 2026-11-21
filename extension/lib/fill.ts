import { z } from "zod";

import { ItemBaseSchema } from "../../src/core/contract/item-wire.ts";
import { parseLink, redditRefOf } from "../../src/core/contract/links.ts";
import { type Config, holdsInstanceAccess, instanceAnswer, instanceRequest } from "./config.ts";
import { fillActive, loadConfig } from "./credentials.ts";
import { type ThreadTab, fetchThread } from "./reddit-thread.ts";
import { send } from "./save.ts";

const ListedSchema = z.object({ items: z.array(ItemBaseSchema.pick({ fillable: true })) });

const filling = new Map<string, AbortController>();

export function cancelFills(): void {
  for (const running of filling.values()) running.abort();
}

async function isWaiting(config: Readonly<Config>, url: string): Promise<boolean> {
  try {
    const response = await instanceRequest(config, `/api/items?${new URLSearchParams({ url })}`, {
      method: "GET",
    });

    const listed = response.ok ? await instanceAnswer(response, ListedSchema) : null;

    return listed?.items.some(({ fillable }) => fillable) === true;
  } catch {
    return false;
  }
}

async function fillOnce(
  config: Readonly<Config>,
  tab: Readonly<ThreadTab>,
  signal: AbortSignal,
): Promise<void> {
  if (!(await isWaiting(config, tab.url)) || signal.aborted) return;

  const fetched = await fetchThread(tab, { fill: true, signal });

  if (fetched !== null && !signal.aborted) await send(config, fetched);
}

async function mayFill({ origin }: Readonly<Config>): Promise<boolean> {
  return (await fillActive()) && (await holdsInstanceAccess(origin));
}

export async function fillOpenedThread(tab: Readonly<ThreadTab>): Promise<void> {
  if (redditRefOf(tab.url) === null) return;

  const key = parseLink(tab.url).normalizedUrl;

  if (filling.has(key)) return;

  const running = new AbortController();
  filling.set(key, running);

  try {
    const config = await loadConfig();

    if (config !== null && (await mayFill(config))) await fillOnce(config, tab, running.signal);
  } finally {
    filling.delete(key);
  }
}
