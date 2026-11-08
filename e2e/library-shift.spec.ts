import { expect, test } from "@playwright/test";

import { newCode, newPassword } from "./access.ts";
import { seedThreads } from "./comment-thread.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import {
  ITEM_READ,
  PHONE,
  type Visit,
  autoOpened,
  emptyLibrary,
  itemReadHeld,
  listedItems,
  openedItem,
  rowsGap,
  shiftOf,
} from "./library-visit.ts";
import { DESKTOP } from "./look.ts";
import { seedRows } from "./reader.ts";

const FIRST_EMPTY_LOAD_SHIFT = { phone: 0.0733, desktop: 0.0684 } as const;
const SHIFT_PRECISION = 3;

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

let screen: FreshScreen;
const seeded = { thread: 0 };

test.describe.configure({ timeout: 120_000 });

test.use({ trace: "off", video: "off", screenshot: "off" });

function shiftNow(visit: Readonly<Visit>) {
  return shiftOf(screen.context, visit);
}

function listSettled(size: Visit["size"], stored: Visit["stored"]): Visit["settled"] {
  return size === DESKTOP && stored["layout"] !== "grid" ? autoOpened : listedItems;
}

function expectNoShift(visit: Readonly<Visit>) {
  return async () => {
    expect(await shiftNow(visit), "layout shift from navigation").toBe(0);
  };
}

function expectRowsMeet(visit: Readonly<Pick<Visit, "size" | "stored">>) {
  return async () => {
    expect(
      await rowsGap(screen.context, visit),
      "first loaded row below the first skeleton row",
    ).toBeCloseTo(0, 1);
  };
}

async function seedLibrary() {
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
      test(`on ${place} with ${look} a second cold load moves nothing`, async () => {
        await shiftNow({ size, stored, path: "/", settled: emptyLibrary });

        expect(
          await shiftNow({ size, stored, path: "/", settled: emptyLibrary }),
          "layout shift from navigation",
        ).toBe(0);
      });

  for (const [place, size, shift] of [
    ["a phone", PHONE, FIRST_EMPTY_LOAD_SHIFT.phone],
    ["a desktop", DESKTOP, FIRST_EMPTY_LOAD_SHIFT.desktop],
  ] as const)
    test(`on ${place} the first cold load of a browser moves the skeleton list by ${shift}`, async () => {
      expect(
        await shiftNow({
          size,
          stored: {},
          path: "/",
          settled: emptyLibrary,
          forgetLastList: true,
        }),
        "layout shift from navigation",
      ).toBeCloseTo(shift, SHIFT_PRECISION);
    });
});

test.describe("with Items", () => {
  startInstance();

  test.beforeAll(seedLibrary);

  for (const [place, size] of SIZES)
    for (const [look, stored] of [...LOOKS, ...GRIDS]) {
      test(
        `on ${place} with ${look} a cold load of the list moves nothing`,
        expectNoShift({ size, stored, path: "/", settled: listSettled(size, stored) }),
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

  test(
    "on a desktop a cold load whose Item read arrives after the rows moves nothing",
    expectNoShift({
      size: DESKTOP,
      stored: {},
      path: "/",
      settled: itemReadHeld,
      hold: ITEM_READ,
    }),
  );

  for (const [place, size] of SIZES)
    for (const [look, stored] of [...LOOKS.slice(0, 1), ...GRIDS.slice(0, 1)])
      test(
        `on ${place} with ${look} the first skeleton row sits where the first loaded row lands`,
        expectRowsMeet({ size, stored }),
      );
});
