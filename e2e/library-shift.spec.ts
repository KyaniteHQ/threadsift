import { type Page, expect, test } from "@playwright/test";

import { STORAGE_KEY } from "../design/system/settings.ts";
import { EMPTY_LIST } from "../web/src/text.ts";
import { newCode, newPassword } from "./access.ts";
import { seedThreads } from "./comment-thread.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { watchLayout } from "./layout-shift.ts";
import { DESKTOP, afterTwoFrames, delayFonts } from "./look.ts";
import { reader, seedRows } from "./reader.ts";

const PHONE = { width: 390, height: 844 } as const;
const FONT_DELAY_MS = 500;
const EMPTY_LIBRARY_SKELETON_SHIFT = 0.1;
const ITEMS_READ = /\/api\/items(\?[^/]*)?$/u;

const LOOKS = [
  ["the default look", {}],
  ["a stored Font", { font: "news" }],
  ["a stored Style", { style: "mymind" }],
] as const;

const SIZES = [
  ["a phone", PHONE],
  ["a desktop", DESKTOP],
] as const;

const GRIDS = [
  ["Grid opening Items as Page", { layout: "grid" }],
  ["Grid opening Items as Sheet", { layout: "grid", openAs: "sheet" }],
] as const;

interface Visit {
  readonly size: Readonly<{ width: number; height: number }>;
  readonly stored: Readonly<Record<string, string>>;
  readonly path: string;
  readonly settled: (page: Page) => Promise<void>;
}

let screen: FreshScreen;
const seeded = { thread: 0 };

test.describe.configure({ timeout: 120_000 });

test.use({ trace: "off", video: "off", screenshot: "off" });

async function shiftOf({ size, stored, path, settled }: Readonly<Visit>): Promise<number> {
  const page = await screen.context.newPage();

  try {
    await page.setViewportSize(size);

    await page.addInitScript(
      ({ key, value }) => {
        localStorage.setItem(key, value);
      },
      { key: STORAGE_KEY, value: JSON.stringify(stored) },
    );

    const watch = await watchLayout(page);
    await delayFonts(page, FONT_DELAY_MS);
    await page.goto(path);
    await settled(page);
    await afterTwoFrames(page);
    await afterTwoFrames(page);

    return (await watch.snapshot()).shift;
  } finally {
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.close();
  }
}

async function emptyLibrary(page: Page) {
  await expect(page.getByRole("heading", { name: EMPTY_LIST.heading })).toBeVisible();
}

async function listedItems(page: Page) {
  await expect(page.locator("article.it").first()).toBeVisible();
}

async function openedItem(page: Page) {
  await expect(reader(page)).toBeVisible();
  await expect(page.locator(".rd-comments li.cm").first()).toBeVisible();
  await expect(page.locator(".rd-loading")).toHaveCount(0);
}

function expectNoShift(visit: Readonly<Visit>) {
  return async () => {
    expect(await shiftOf(visit), "layout shift from navigation").toBe(0);
  };
}

async function firstRowTops({ size, stored }: Readonly<Pick<Visit, "size" | "stored">>) {
  const page = await screen.context.newPage();
  const release = Promise.withResolvers<void>();

  try {
    await page.setViewportSize(size);

    await page.addInitScript(
      ({ key, value }) => {
        localStorage.setItem(key, value);
      },
      { key: STORAGE_KEY, value: JSON.stringify(stored) },
    );

    await page.route(ITEMS_READ, async (route) => {
      const response = await route.fetch();
      await release.promise;
      await route.fulfill({ response });
    });

    await page.goto("/");

    const ghost = page.locator(".it-ghost").first();
    await expect(ghost).toBeVisible();
    const ghostTop = await ghost.evaluate((element) => element.getBoundingClientRect().top);

    release.resolve();
    await listedItems(page);
    await afterTwoFrames(page);

    const rowTop = await page
      .locator("article.it")
      .first()
      .evaluate((element) => element.getBoundingClientRect().top);

    return { ghostTop, rowTop };
  } finally {
    release.resolve();
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.close();
  }
}

function startInstance() {
  test.beforeAll(async ({ browser }) => {
    screen = await openSignedIn(browser, newCode(), newPassword());
  });

  test.afterAll(async () => {
    await screen.close();
  });
}

test.describe("with an empty library", () => {
  startInstance();

  for (const [place, size] of SIZES)
    for (const [look, stored] of LOOKS)
      test(`on ${place} with ${look} only the skeleton list moves`, async () => {
        expect(
          await shiftOf({ size, stored, path: "/", settled: emptyLibrary }),
          "layout shift from navigation",
        ).toBeLessThan(EMPTY_LIBRARY_SKELETON_SHIFT);
      });
});

test.describe("with Items", () => {
  startInstance();

  test.beforeAll(async () => {
    seeded.thread = (await seedThreads(screen)).thread;

    seedRows(screen, [
      { url: "https://example.org/caching", title: "An article about caching", author: "someone" },
      {
        url: "https://github.com/someone/project",
        title: "A GitHub repo",
        source: "github",
        kind: "github-repo",
      },
      { url: "https://example.org/queues", title: "An article about queues", read: true },
    ]);
  });

  for (const [place, size] of SIZES)
    for (const [look, stored] of [...LOOKS, ...GRIDS]) {
      test(
        `on ${place} with ${look} a cold load of the list moves nothing`,
        expectNoShift({ size, stored, path: "/", settled: listedItems }),
      );

      test(`on ${place} with ${look} a cold load of an open Item moves nothing`, async () => {
        await expectNoShift({
          size,
          stored,
          path: `/items/${seeded.thread}`,
          settled: openedItem,
        })();
      });
    }

  for (const [place, size] of SIZES)
    for (const [look, stored] of [...LOOKS.slice(0, 1), ...GRIDS.slice(0, 1)])
      test(`on ${place} with ${look} the first skeleton row sits where the first loaded row lands`, async () => {
        const { ghostTop, rowTop } = await firstRowTops({ size, stored });

        expect(rowTop, "top of the first loaded row against the first skeleton row").toBeCloseTo(
          ghostTop,
          1,
        );
      });
});
