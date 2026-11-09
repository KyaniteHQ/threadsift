import { type Browser, type BrowserContext, type Page, expect } from "@playwright/test";
import { z } from "zod";

import { STORAGE_KEY } from "../design/system/settings.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { DESKTOP, type Stored, viewportAt } from "./look.ts";

export const FILES = "/api/files/";

export const ItemAnswer = z.object({
  item: z.object({
    id: z.number(),
    postText: z.string().nullable().optional(),
    image: z.object({ url: z.string(), alt: z.string() }).nullable(),
  }),
});

export const ListAnswer = z.object({
  items: z.array(
    z.object({ id: z.number(), image: z.object({ url: z.string(), alt: z.string() }).nullable() }),
  ),
});

export const RawItems = z.object({ items: z.array(z.record(z.string(), z.unknown())) });

export const RawItem = z.object({ item: z.record(z.string(), z.unknown()) });

export interface Watched {
  readonly context: BrowserContext;
  readonly page: Page;
  readonly requests: readonly string[];
}

export async function watchedPage(
  browser: Browser,
  screen: FreshScreen,
  stored: Stored,
  width = DESKTOP.width,
): Promise<Watched> {
  const context = await browser.newContext({
    baseURL: screen.fresh.url,
    storageState: await screen.context.storageState(),
  });

  await context.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, value);
    },
    { key: STORAGE_KEY, value: JSON.stringify(stored) },
  );

  const requests: string[] = [];

  context.on("request", (request) => {
    requests.push(request.url());
  });

  const page = await context.newPage();
  await viewportAt(page, width);

  return { context, page, requests };
}

export function fileRequests(requests: readonly string[]): string[] {
  return requests.filter((url) => new URL(url).pathname.startsWith(FILES));
}

export async function expectLoaded(page: Page, selector: string, count: number): Promise<void> {
  const pictures = page.locator(selector);
  await expect(pictures).toHaveCount(count);

  for (let at = 0; at < count; at += 1) {
    const picture = pictures.nth(at);
    await picture.scrollIntoViewIfNeeded();
    await expect
      .poll(
        () => picture.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
        {
          message: `picture ${at + 1} of ${count} in ${selector}`,
        },
      )
      .toBe(true);
  }
}
