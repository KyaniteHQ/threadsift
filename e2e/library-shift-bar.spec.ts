import { expect, test } from "@playwright/test";

import { newCode, newPassword } from "./access.ts";
import { seedThreads } from "./comment-thread.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { seedLongCatalog } from "./library-text-seed.ts";
import { listedItems, rowsGap, shiftOf } from "./library-visit.ts";

const GRID = { layout: "grid" } as const;
const HEIGHT = 900;
const PRECISION = 3;

const WIDTHS = [800, 960, 1100] as const;

const LONG_NAME_JUMPS = [
  { width: 800, shift: 0.0421, rows: 92 },
  { width: 960, shift: 0.0154, rows: 46 },
  { width: 1100, shift: 0, rows: 0 },
] as const;

let screen: FreshScreen;

test.describe.configure({ timeout: 120_000 });

test.use({ trace: "off", video: "off", screenshot: "off" });

function startInstance(seed: (screen: FreshScreen) => Promise<void>) {
  test.beforeAll(async ({ browser }) => {
    screen = await openSignedIn(browser, newCode(), newPassword());
    await seed(screen);
  });

  test.afterAll(async () => {
    await screen.close();
  });
}

async function barAt(width: number) {
  const size = { width, height: HEIGHT };

  const shift = await shiftOf(screen.context, {
    size,
    stored: GRID,
    path: "/",
    settled: listedItems,
  });

  return { shift, rows: await rowsGap(screen.context, { size, stored: GRID }) };
}

test.describe("with short Topic and Tag names", () => {
  startInstance(async (fresh) => {
    await seedThreads(fresh);
  });

  for (const width of WIDTHS)
    test(`at ${width} px the Grid filter bar is drawn where the loaded bar lands`, async () => {
      const { shift, rows } = await barAt(width);

      expect(shift, "layout shift from navigation").toBe(0);
      expect(rows, "first loaded row below the first skeleton row").toBeCloseTo(0, 1);
    });
});

test.describe("with long Topic and Tag names", () => {
  startInstance(async (fresh) => {
    await seedThreads(fresh);
    await seedLongCatalog(fresh);
  });

  for (const { width, shift: expected, rows: expectedRows } of LONG_NAME_JUMPS)
    test(`at ${width} px the Grid filter bar grows by a known amount when the names arrive`, async () => {
      const { shift, rows } = await barAt(width);

      expect(shift, "layout shift from navigation").toBeCloseTo(expected, PRECISION);
      expect(rows, "first loaded row below the first skeleton row").toBeCloseTo(expectedRows, 1);
    });
});
