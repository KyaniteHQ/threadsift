import type { APIRequestContext, Locator, Page, TestInfo } from "@playwright/test";
import { expect } from "@playwright/test";
import { z } from "zod";

import { SavedItemResponseSchema } from "../src/http/schemas.ts";
import { CARD_TITLES, FAILURE_TITLES } from "../web/src/text.ts";
import { mainInstance } from "./access.ts";
import { itemOf, postLink } from "./api.ts";
import { pasteCard, pasteField } from "./links.ts";

export const SLOW_PAGE = "https://httpbin.org/delay/3";
export const CLOSE_MS = 6000;

export const READING = CARD_TITLES.reading;
export const ADDED = CARD_TITLES.added;
export const REFRESHED = CARD_TITLES.refreshed;
export const TIMED_OUT = FAILURE_TITLES.timeout;

export function cardTitle(page: Page): Locator {
  return pasteCard(page).locator(".ps-title");
}

export async function pasteOnly(page: Page, url: string): Promise<void> {
  await pasteField(page).fill(url);
  await pasteField(page).press("Enter");
}

export interface CardTrace {
  readonly titles: readonly string[];
  readonly skeleton: boolean;
  readonly tops: readonly number[];
}

export async function watchCard(page: Page): Promise<() => Promise<CardTrace>> {
  const trace = await page.evaluateHandle(() => {
    const titles: string[] = [];
    const tops = new Set<number>();
    const seen = { titles, skeleton: false, tops };

    const note = (): void => {
      const text = document.querySelector(".paste .ps-title")?.textContent ?? "";

      if (text !== "" && seen.titles.at(-1) !== text) {
        seen.titles.push(text);
      }

      seen.skeleton ||= document.querySelector(".it .skel") !== null;

      const first = document.querySelector("article.it");

      if (first !== null) {
        tops.add(Math.round(first.getBoundingClientRect().top));
      }
    };

    new MutationObserver(note).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });

    return seen;
  });

  return () =>
    trace.evaluate((seen) => ({
      titles: [...seen.titles],
      skeleton: seen.skeleton,
      tops: [...seen.tops],
    }));
}

export function countListReads(page: Page): () => number {
  let reads = 0;

  page.on("request", (request) => {
    if (request.method() === "GET" && new URL(request.url()).pathname === "/api/items") {
      reads += 1;
    }
  });

  return () => reads;
}

export async function pasteForId(page: Page, url: string): Promise<number> {
  const answered = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && new URL(response.url()).pathname === "/api/items",
  );

  await pasteOnly(page, url);

  return SavedItemResponseSchema.parse(await (await answered).json()).item.id;
}

export function elapsedSince(started: number): number {
  return Date.now() - started;
}

const Counts = z.array(z.object({ n: z.number() }));

export function stuckProcessingItems(): number {
  const [row] = mainInstance().query(
    "SELECT count(*) AS n FROM items i JOIN jobs j ON j.item_id = i.id WHERE i.status = 'processing' AND j.state = 'done' AND NOT EXISTS (SELECT 1 FROM jobs o WHERE o.item_id = i.id AND o.state <> 'done')",
    Counts,
  );

  return row?.n ?? 0;
}

const Doubled = z.array(z.object({ item_id: z.number() }));

export function itemsWithTwoRunningJobs(): number[] {
  return mainInstance()
    .query(
      "SELECT item_id FROM jobs WHERE state = 'running' GROUP BY item_id HAVING count(*) > 1",
      Doubled,
    )
    .map((row) => row.item_id);
}

export async function attachStatuses(
  request: APIRequestContext,
  info: TestInfo,
  step: string,
  ids: readonly number[],
): Promise<void> {
  const items = await Promise.all(
    ids.map(async (id) => {
      const { status, reason, fetch, normalizedUrl } = await itemOf(request, id);

      return { id, normalizedUrl, status, reason, fetch };
    }),
  );

  await info.attach(`statuses-${step}.json`, {
    body: JSON.stringify({ step, items }, null, 2),
    contentType: "application/json",
  });

  expect(
    stuckProcessingItems(),
    `after ${step}, an Item stays processing after its job ended`,
  ).toBe(0);
  expect(itemsWithTwoRunningJobs(), `after ${step}, a job runs twice at once`).toEqual([]);
}

export async function openLibrary(page: Page, width = 1440): Promise<void> {
  await page.setViewportSize({ width, height: width < 480 ? 640 : 900 });
  await page.goto("/");
  await expect(pasteField(page)).toBeVisible();
  await expect(page.locator("article.it").first()).toBeVisible();
}

export async function seed(page: Page, request: APIRequestContext, run: string) {
  const { body } = await postLink(request, `https://example.com/${run}/seed`);
  await openLibrary(page);

  return body.item;
}
