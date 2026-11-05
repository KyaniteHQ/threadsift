import type { APIRequestContext, Locator, Page, TestInfo } from "@playwright/test";
import { expect } from "@playwright/test";
import { z } from "zod";

import { SavedItemResponseSchema } from "../src/http/schemas.ts";
import { CARD_TITLES, FAILURE_TITLES } from "../web/src/text.ts";
import { mainInstance } from "./access.ts";
import { itemOf, postLink } from "./api.ts";
import { pasteCard, pasteField } from "./links.ts";
import { viewportAt } from "./look.ts";

export const SLOW_PAGE = "https://httpbin.org/delay/3";
export const CLOSE_MS = 6000;

export const READING = CARD_TITLES.reading;
export const ADDED = CARD_TITLES.added;
export const REFRESHED = CARD_TITLES.refreshed;
export const TIMED_OUT = FAILURE_TITLES.timeout;
export const UNREACHABLE = FAILURE_TITLES.network;

export function cardTitle(page: Page): Locator {
  return pasteCard(page).locator(".ps-title");
}

export function alertRegion(page: Page): Locator {
  return page.locator(".paste [role='alert']");
}

export async function pasteOnly(page: Page, url: string): Promise<void> {
  await pasteField(page).fill(url);
  await pasteField(page).press("Enter");
}

export interface CardTrace {
  readonly titles: readonly string[];
  readonly skeleton: boolean;
  readonly overlaps: number;
}

export function rowsUnderCard(page: Page): Promise<number> {
  return page.evaluate(() => {
    const card = document.querySelector(".paste .ps")?.getBoundingClientRect();

    if (card === undefined) {
      throw new Error("no card is showing");
    }

    return [...document.querySelectorAll("article.it")].filter((row) => {
      const box = row.getBoundingClientRect();

      return (
        box.left < card.right &&
        box.right > card.left &&
        box.top < card.bottom &&
        box.bottom > card.top
      );
    }).length;
  });
}

export async function watchCard(page: Page): Promise<() => Promise<CardTrace>> {
  const trace = await page.evaluateHandle(() => {
    const titles: string[] = [];
    const seen = { titles, skeleton: false, overlaps: 0 };

    const note = (): void => {
      const text = document.querySelector(".paste .ps-title")?.textContent ?? "";

      if (text !== "" && seen.titles.at(-1) !== text) {
        seen.titles.push(text);
      }

      seen.skeleton ||= document.querySelector(".it .skel") !== null;

      const card = document.querySelector(".paste .ps")?.getBoundingClientRect();

      if (card !== undefined) {
        for (const row of document.querySelectorAll("article.it")) {
          const box = row.getBoundingClientRect();

          if (
            box.left < card.right &&
            box.right > card.left &&
            box.top < card.bottom &&
            box.bottom > card.top
          ) {
            seen.overlaps += 1;
          }
        }
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
      overlaps: seen.overlaps,
    }));
}

export async function watchAnnouncements(
  page: Page,
): Promise<
  () => Promise<{ readonly polite: readonly string[]; readonly alert: readonly string[] }>
> {
  const trace = await page.evaluateHandle(() => {
    const seen = { polite: new Array<string>(), alert: new Array<string>() };

    const regions = [
      [document.querySelector(".paste output"), seen.polite],
      [document.querySelector(".paste [role='alert']"), seen.alert],
    ] as const;

    for (const [region, texts] of regions) {
      if (region === null) {
        throw new Error("a live region is not mounted");
      }

      new MutationObserver(() => {
        const text = region.textContent ?? "";

        if (text !== "" && texts.at(-1) !== text) {
          texts.push(text);
        }
      }).observe(region, { subtree: true, childList: true, characterData: true });
    }

    return seen;
  });

  return () => trace.evaluate((seen) => ({ polite: [...seen.polite], alert: [...seen.alert] }));
}

export function countListReads(page: Page) {
  let reads = 0;

  page.on("request", (request) => {
    if (request.method() === "GET" && new URL(request.url()).pathname === "/api/items") {
      reads += 1;
    }
  });

  const baseline = reads;

  return {
    expectNoNewReads: () => {
      expect(reads, "the list was read again").toBe(baseline);
    },
  };
}

export async function expectClosesAfterSixSeconds(page: Page): Promise<void> {
  await page.clock.fastForward(CLOSE_MS - 1500);
  await expect(pasteCard(page)).toBeVisible();
  await page.clock.fastForward(2500);
  await expect(pasteCard(page)).toBeHidden();
}

export function unreachableUrl(run: string): string {
  return `https://no-such-host-${run}.invalid/`;
}

export async function pasteForId(page: Page, url: string): Promise<number> {
  const answered = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && new URL(response.url()).pathname === "/api/items",
  );

  await pasteOnly(page, url);

  return SavedItemResponseSchema.parse(await (await answered).json()).item.id;
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
  await viewportAt(page, width);
  await page.goto("/");
  await expect(pasteField(page)).toBeVisible();
  await expect(page.locator("article.it").first()).toBeVisible();
}

export async function seed(page: Page, request: APIRequestContext, run: string) {
  const { body } = await postLink(request, `https://example.com/${run}/seed`);
  await openLibrary(page);

  return body.item;
}
