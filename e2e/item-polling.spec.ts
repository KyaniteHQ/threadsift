import { type Page, expect, test } from "@playwright/test";

import { newCode, newPassword } from "./access.ts";
import { pasteForId } from "./card.ts";
import { agentHeaders } from "./catalog.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { WAIT_MS, WAIT_REASON } from "./github-wait.ts";
import { deferJobs } from "./ingest.ts";
import { row, seedRows } from "./reader.ts";

test.describe.configure({ timeout: 120_000 });

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

let screen: FreshScreen;

test.beforeEach(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
});

test.afterEach(async () => {
  await screen.close();
});

function processing(urls: readonly string[]): readonly number[] {
  const ids = seedRows(
    screen,
    urls.map((url) => ({ url, title: url, fetchResult: "ok" })),
  );

  screen.fresh.sql(`UPDATE items SET status = 'processing'`);

  return ids;
}

function statusReads(page: Page) {
  const reads = new Map<number, number>();
  let inFlight = 0;

  page.on("request", (request) => {
    const id = /^\/api\/items\/(\d+)\/status$/u.exec(new URL(request.url()).pathname)?.[1];

    if (id !== undefined) {
      inFlight += 1;
      reads.set(Number(id), (reads.get(Number(id)) ?? 0) + 1);
    }
  });
  page.on("requestfinished", (request) => {
    if (request.url().endsWith("/status")) inFlight -= 1;
  });
  page.on("requestfailed", (request) => {
    if (request.url().endsWith("/status")) inFlight -= 1;
  });

  return {
    of: (id: number): number => reads.get(id) ?? 0,
    settled: async (): Promise<void> => {
      await expect.poll(() => inFlight).toBe(0);
      await page.evaluate(() => Promise.resolve());
    },
  };
}

async function runSeconds(page: Page, seconds: number, settled: () => Promise<void>) {
  for (let second = 0; second < seconds; second += 1) {
    await page.clock.runFor(1000);
    await settled();
  }
}

async function openPaused(page: Page, ids: readonly number[]): Promise<void> {
  await page.clock.install({ time: Date.now() });
  await page.goto("/");

  for (const id of ids) {
    await expect(row(page, id)).toBeVisible();
  }

  await page.clock.pauseAt(Date.now() + 1000);
}

test("an Item deleted elsewhere is read once more, leaves the list and is never read again", async () => {
  const { page } = screen;

  const [kept = 0, deleted = 0] = processing([
    "https://example.com/kept",
    "https://example.com/gone",
  ]);

  const reads = statusReads(page);

  await openPaused(page, [kept, deleted]);

  const removal = await screen.context.request.delete(`/api/items/${deleted}`, {
    headers: await agentHeaders(screen),
  });

  expect(removal.status()).toBe(204);

  await runSeconds(page, 3, reads.settled);
  await expect(row(page, deleted)).toHaveCount(0);

  const afterGone = reads.of(deleted);
  const keptReads = reads.of(kept);

  await runSeconds(page, 30, reads.settled);

  expect(reads.of(deleted)).toBe(afterGone);
  expect(reads.of(kept) - keptReads).toBeGreaterThanOrEqual(5);
  await expect(row(page, kept)).toBeVisible();
});

test("a new processing Item does not start the others' reads over at once a second", async () => {
  const { page } = screen;
  const [old = 0] = processing(["https://example.com/old"]);
  const reads = statusReads(page);

  await openPaused(page, [old]);
  await runSeconds(page, 30, reads.settled);

  const before = reads.of(old);

  expect(before).toBeGreaterThan(10);

  const restore = deferJobs(screen.fresh, "fetch");

  try {
    await pasteForId(page, "https://example.com/new");
  } finally {
    restore();
  }

  await runSeconds(page, 10, reads.settled);

  expect(reads.of(old) - before).toBeLessThanOrEqual(3);
});

test("an Item that waits for a time is read about once a minute until that time", async () => {
  const { page } = screen;
  const [waiting = 0] = processing(["https://github.com/example/waiting"]);
  const until = Date.now() + WAIT_MS;

  screen.fresh.sql(
    `INSERT INTO jobs (kind, item_id, address, state, attempts, next_attempt_at, wait_reason) VALUES ('fetch', ${waiting}, 'https://github.com/example/waiting', 'queued', 0, ${until}, '${WAIT_REASON}')`,
  );

  const reads = statusReads(page);

  await openPaused(page, [waiting]);
  await runSeconds(page, 120, reads.settled);

  expect(reads.of(waiting)).toBeGreaterThanOrEqual(1);
  expect(reads.of(waiting)).toBeLessThanOrEqual(3);
});
