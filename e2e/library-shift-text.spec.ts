import { expect, test } from "@playwright/test";

import { newCode, newPassword } from "./access.ts";
import { seedThreads } from "./comment-thread.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { seedForeignText } from "./library-text-seed.ts";
import {
  PHONE,
  type Visit,
  autoOpened,
  listedItems,
  openedItem,
  shiftOf,
} from "./library-visit.ts";
import { DESKTOP } from "./look.ts";
import { seedRows } from "./reader.ts";

const LOOKS = [
  ["the default look", {}],
  ["a stored Font", { font: "news" }],
  ["a stored Style", { style: "mymind" }],
] as const;

const SIZES = [
  ["a phone", PHONE],
  ["a desktop", DESKTOP],
] as const;

let screen: FreshScreen;
const seeded = { foreign: 0 };

test.describe.configure({ timeout: 120_000 });

test.use({ trace: "off", video: "off", screenshot: "off" });

test.beforeAll(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
  seedRows(screen, [{ url: "https://example.org/caching", title: "An article about caching" }]);
  seeded.foreign = await seedForeignText(screen);
  await seedThreads(screen);
});

test.afterAll(async () => {
  await screen.close();
});

function expectNoShift(visit: Readonly<Visit>) {
  return async () => {
    expect(await shiftOf(screen.context, visit), "layout shift from navigation").toBe(0);
  };
}

test.describe("with Cyrillic, Turkish and italic text", () => {
  for (const [place, size] of SIZES)
    for (const [look, stored] of LOOKS) {
      test(
        `on ${place} with ${look} a cold load of the list moves nothing`,
        expectNoShift({
          size,
          stored,
          path: "/",
          settled: size === DESKTOP ? autoOpened : listedItems,
        }),
      );

      test(`on ${place} with ${look} a cold load of an open Item moves nothing`, async () => {
        await expectNoShift({
          size,
          stored,
          path: `/items/${seeded.foreign}`,
          settled: openedItem,
        })();
      });
    }
});
