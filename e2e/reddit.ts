import { setTimeout as sleep } from "node:timers/promises";

import { test } from "@playwright/test";

import { isRedditShareLink, parseLink } from "../src/core/links.ts";

const OEMBED_SPACING_MS = 2000;

export const POST_ID = "2a4qo6";
export const POST_URL = `https://reddit.com/r/all/comments/${POST_ID}/`;
export const POST_TITLE = "Wallabag - A 'read it later' app similar like Instapaper or Pocket";

let lastCallAt = 0;

export async function waitForRedditTurn(url: string): Promise<void> {
  const wait = lastCallAt + OEMBED_SPACING_MS - Date.now();

  if (wait > 0) {
    await sleep(wait);
  }

  lastCallAt = Date.now();
  test.info().annotations.push({ type: "reddit-oembed", description: url });
}

export async function waitForRedditTurnIfNeeded(url: string): Promise<void> {
  if (parseLink(url).source === "reddit" || isRedditShareLink(url)) {
    await waitForRedditTurn(url);
  }
}
