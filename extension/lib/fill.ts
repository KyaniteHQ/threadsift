import { browser } from "wxt/browser";
import { z } from "zod";

import { parseLink, redditRefOf } from "../../src/core/links.ts";
import { type Config, REDDIT_HOSTS, hostPattern } from "./config.ts";
import { loadConfig } from "./credentials.ts";
import { type ThreadTab, fetchThread } from "./reddit-thread.ts";
import { REQUEST_DEADLINE_MS, send } from "./save.ts";

const ListedSchema = z.object({ items: z.array(z.object({ fillable: z.boolean() })) });

const filling = new Set<string>();

async function isWaiting({ origin, token }: Readonly<Config>, url: string): Promise<boolean> {
  const address = new URL("/api/items", origin);
  address.searchParams.set("url", url);

  try {
    const response = await fetch(address, {
      headers: { authorization: `Bearer ${token}` },
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_DEADLINE_MS),
    });

    const listed = ListedSchema.safeParse(response.ok ? await response.json() : null);

    return listed.success && listed.data.items.some(({ fillable }) => fillable);
  } catch {
    return false;
  }
}

async function fillOnce(config: Readonly<Config>, tab: Readonly<ThreadTab>): Promise<void> {
  if (!(await isWaiting(config, tab.url))) return;

  const answers = await fetchThread(tab);

  if (answers !== null) await send(config, { url: tab.url, content: answers, fill: true });
}

export async function fillOpenedThread(tab: Readonly<ThreadTab>): Promise<void> {
  const config = await loadConfig();

  if (config === null || redditRefOf(tab.url) === null) return;

  const origins = [hostPattern(config.origin), ...REDDIT_HOSTS];

  if (!(await browser.permissions.contains({ origins }))) return;

  const key = parseLink(tab.url).normalizedUrl;

  if (filling.has(key)) return;

  filling.add(key);

  try {
    await fillOnce(config, tab);
  } finally {
    filling.delete(key);
  }
}
