import { type Locator, type Page, type TestInfo, expect, test } from "@playwright/test";

import { TOKEN_REFUSED } from "../web/src/text.ts";
import { newCode, newPassword } from "./access.ts";
import { BANDS_AT_WIDTH, THEMES, expectNoViolations, resize } from "./design-screens.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { DESKTOP, storeSettings, viewportAt } from "./look.ts";
import { paragraphs, reader, row, seedRows } from "./reader.ts";

const DAY_MS = 86_400_000;

const FULL = {
  url: "https://github.com/example/full-block",
  description:
    "A library that reads a saved page and keeps only the useful parts, with a description long enough to wrap onto a second line on a phone.",
  stars: 12_480,
  topics: ["markdown", "readability", "obsidian", "web-clipper", "a-topic-with-a-rather-long-name"],
};

const BARE = { url: "https://github.com/example/bare-block", stars: 0 };
const SINGLE = { url: "https://github.com/example/one-star", stars: 1 };
const REJECTED = { url: "https://github.com/example/rejected-token", stars: 7 };

let screen: FreshScreen;
let fullId: number;
let bareId: number;
let singleId: number;
let rejectedId: number;

test.describe.configure({ timeout: 360_000 });

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

function repositoryRow(id: number, values: string): string {
  return `INSERT INTO github_repos (item_id, description, stars, language, license, topics, pushed_at) VALUES (${id}, ${values})`;
}

function storeRepositories([full, bare, single, rejected]: readonly number[]): void {
  const rows = [
    [
      full,
      `'${FULL.description}', ${FULL.stars}, 'TypeScript', 'MIT', '${JSON.stringify(FULL.topics)}', ${Date.now() - 3 * DAY_MS}`,
    ],
    [rejected, `'Kept from the last good fetch', ${REJECTED.stars}, 'Go', 'MIT', '[]', NULL`],
    [bare, `NULL, ${BARE.stars}, NULL, NULL, '[]', NULL`],
    [single, `NULL, ${SINGLE.stars}, 'Go', 'Apache-2.0', '[]', ${Date.now() - 200 * DAY_MS}`],
  ] as const;

  for (const [id = 0, values] of rows) screen.fresh.sql(repositoryRow(id, values));
}

function seedsOf() {
  const seed = { source: "github", kind: "github-repo", fetchResult: "ok" } as const;

  return [
    {
      ...seed,
      url: FULL.url,
      title: "example/full-block",
      author: "example",
      postText: `# Full block\n\n${paragraphs(8, "README")}\n\n\`\`\`sh\nnpm install full-block\n\`\`\``,
      savedAt: Date.now() + 3000,
    },
    {
      ...seed,
      url: BARE.url,
      title: "example/bare-block",
      author: "example",
      savedAt: Date.now() + 2000,
    },
    {
      ...seed,
      url: SINGLE.url,
      title: "example/one-star",
      author: "example",
      savedAt: Date.now() + 1000,
    },
    {
      ...seed,
      url: REJECTED.url,
      title: "example/rejected-token",
      author: "example",
      postText: `# Rejected token\n\n${paragraphs(3, "README")}`,
      fetchResult: "github-token",
      savedAt: Date.now() + 500,
    },
  ];
}

test.beforeAll(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());

  const ids = seedRows(screen, seedsOf());

  [fullId = 0, bareId = 0, singleId = 0, rejectedId = 0] = ids;
  storeRepositories(ids);
});

test.afterAll(async () => {
  await screen.close();
});

async function attachShot(target: Locator, info: TestInfo, name: string): Promise<void> {
  const path = info.outputPath(`${name}.png`);
  await target.screenshot({ path });
  await info.attach(name, { path, contentType: "image/png" });
}

async function openReader(page: Page, id: number, theme: (typeof THEMES)[number]): Promise<void> {
  await storeSettings(page, { theme }, `/items/${id}`);
  await expect(reader(page)).toBeVisible();
  await expect(page.locator(".repo")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

function breaksNoRule(name: string, which: () => number): void {
  test(`the Reader open on ${name} breaks no design rule in Light, Dark and Sepia at 390, 600, 1440 and 1920 px`, async () => {
    const { page } = screen;

    for (const theme of THEMES) {
      for (const [width, bands] of BANDS_AT_WIDTH) {
        await viewportAt(page, width);
        await openReader(page, which(), theme);
        await resize(page, width, bands);
        await expectNoViolations(page, `${name}, ${theme} at ${width}px`);
      }
    }
  });
}

breaksNoRule("a repository with every field", () => fullId);

breaksNoRule(
  "a repository with no description, language, license, topics or last push",
  () => bareId,
);

breaksNoRule("a repository whose saved token GitHub rejected", () => rejectedId);

test("a repository whose saved token GitHub rejected says so in its row and in the Reader, each with a link to Settings", async () => {
  const { page } = screen;

  await viewportAt(page, DESKTOP.width);
  await openReader(page, rejectedId, "light");
  await expect(row(page, rejectedId).locator(".it-fail")).toContainText(TOKEN_REFUSED.row);
  await expect(
    row(page, rejectedId).getByRole("link", { name: TOKEN_REFUSED.link, exact: true }),
  ).toHaveAttribute("href", "/settings");
  await expect(page.locator(".rd-note", { hasText: TOKEN_REFUSED.reader })).toBeVisible();
  await expect(
    page.locator(".rd-col").getByRole("link", { name: TOKEN_REFUSED.link, exact: true }),
  ).toHaveAttribute("href", "/settings");
  await attachShot(page.locator(".rd-col"), test.info(), "reader-token-rejected-light");
  await attachShot(row(page, rejectedId), test.info(), "row-token-rejected-light");
});

test("the repository block shows each value and its fallback, and the row shows the stars line", async () => {
  const { page } = screen;
  const info = test.info();

  for (const theme of ["light", "dark"] as const) {
    await viewportAt(page, DESKTOP.width);
    await openReader(page, fullId, theme);
    await expect(page.locator(".repo-stats dd")).toHaveText([
      "12,480",
      "TypeScript",
      "MIT",
      "3d ago",
    ]);
    await expect(page.locator(".gh-topics")).toContainText(FULL.topics.join(", "));
    await expect(page.locator(".repo + .rd-orig")).toBeVisible();
    await attachShot(page.locator(".repo"), info, `repository-block-${theme}`);
    await attachShot(page.locator(".rd-col"), info, `reader-repository-${theme}`);
    await attachShot(row(page, fullId), info, `row-stars-${theme}`);
  }

  await openReader(page, bareId, "light");
  await expect(page.locator(".repo-stats dd")).toHaveText([
    "0",
    "None stated",
    "None stated",
    "None stated",
  ]);
  await expect(page.locator(".gh-topics")).toHaveCount(0);
  await attachShot(page.locator(".rd-col"), info, "reader-repository-bare-light");

  const rows = [
    [fullId, "12,480 stars"],
    [bareId, "0 stars"],
    [singleId, "1 star"],
  ] as const;

  for (const [id, text] of rows) {
    await expect(row(page, id).locator(".it-foot")).toHaveText(text);
  }
});
