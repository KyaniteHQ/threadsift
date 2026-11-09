import { type Locator, type Page, expect, test } from "@playwright/test";

import { newCode, newPassword } from "./access.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import {
  keepButton,
  openReader,
  popover,
  seedThread,
  selectAcross,
  selectBetween,
} from "./highlight-reader.ts";
import { highlightsOf } from "./highlights.ts";
import { DESKTOP } from "./look.ts";
import { reader } from "./reader.ts";
import { run } from "./thread-fixtures.ts";
import { comment } from "./threads.ts";

test.describe.configure({ timeout: 300_000 });

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

let screen: FreshScreen;

test.beforeAll(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
});

test.afterAll(async () => {
  await screen.close();
});

const CONSTRUCTS = [
  "Intro paragraph with 😀 and 🐙 emoji, plus a hard  \nbreak line here.",
  "| left | right |\n|---|---|\n| alpha | beta |\n| gamma | delta |",
  "```sh\nmkdir -p cache\nls cache\n```",
  "![diagram of cache](https://example.com/cache.png)",
  "- [ ] open task item\n- [x] done task item",
  "> A quoted line\n> with a second line",
  "Raw <b>html</b> stays text, and a footnote[^1] follows.\n\n[^1]: The footnote text.",
  "1. first step\n2. second step\n   - nested step",
].join("\n\n");

const CASES = [
  ["😀", "🐙", "😀 and 🐙"],
  ["hard", "break", "hard\nbreak"],
  ["alpha", "delta", "alpha\tbeta\ngamma\tdelta"],
  ["mkdir -p cache", "ls cache", "mkdir -p cache\nls cache"],
  ["diagram of cache", "diagram of cache", "diagram of cache"],
  ["open task item", "done task item", "open task item\ndone task item"],
  ["A quoted", "second line", "A quoted line with a second line"],
  ["Raw", "stays text", "Raw <b>html</b> stays text"],
  ["The footnote text.", "The footnote text.", "The footnote text."],
  ["first step", "nested step", "first step\nsecond step\nnested step"],
] as const;

test("a passage across emoji, a hard break, a table, code, an image, task items, a quote, raw HTML, a footnote and nested lists is accepted by the server and marked over the same text", async () => {
  const { page, context } = screen;
  const id = await seedThread(screen, { id: `t${run}`, text: CONSTRUCTS });
  await openReader(page, id, DESKTOP.width);
  const body = reader(page).locator(".md").first();

  for (const [from, to, exact] of CASES) {
    await selectBetween(body, from, to);
    await expect(keepButton(page), exact).toBeVisible();
    await keepButton(page).click();
    await expect(popover(page)).toBeHidden();

    await expect
      .poll(async () => (await highlightsOf(context.request, id)).items.at(-1)?.selector.exact, {
        message: exact,
      })
      .toBe(exact);

    const saved = (await highlightsOf(context.request, id)).items.at(-1);
    expect(saved?.status, exact).toBe("attached");

    const shown = body.locator(`mark[data-highlights~="${saved?.id ?? 0}"]`);
    await expect(shown.first(), exact).toBeVisible();
    expect((await shown.allTextContents()).join("").replaceAll(/\s+/gu, ""), exact).toBe(
      exact.replaceAll(/\s+/gu, ""),
    );
  }

  await page.reload();
  await expect(reader(page).locator(".md").first()).toBeVisible();
  await expect(reader(page).locator("mark[data-highlights]").first()).toBeVisible();
  expect((await highlightsOf(context.request, id)).items.map((item) => item.status)).toEqual(
    CASES.map(() => "attached"),
  );
});

const LONG_CODE = [
  "```sh",
  ...Array.from({ length: 30 }, (_, index) => `echo step ${index + 1}`),
  "```",
].join("\n");

async function offered(page: Page, scope: Locator): Promise<void> {
  await selectBetween(scope, "A closing", "the post.");
  await expect(keepButton(page)).toBeVisible();
}

test("a selection that spans two targets, a Context stub, a control, the summary or the list offers no Keep panel", async () => {
  const { page, context } = screen;

  const id = await seedThread(screen, {
    id: `u${run}`,
    text: `${LONG_CODE}\n\nA closing paragraph of the post.`,
    comments: [
      comment("c0", "reader_0", "A parent remark that the Digest does not keep.", [
        comment("c1", "reader_a", "A kept reply with enough words to select."),
      ]),
      comment("c2", "reader_b", "A second kept remark about the cache."),
    ],
    kept: ["t1_c1", "t1_c2"],
  });

  await openReader(page, id, DESKTOP.width);
  const bodies = reader(page).locator(".md");
  const body = bodies.first();
  const stub = reader(page).locator(".cm-stub").first();

  const refused: readonly (readonly [string, () => Promise<void>])[] = [
    ["the post and a comment", () => selectAcross(page, body, bodies.nth(1))],
    ["two comments", () => selectAcross(page, bodies.nth(1), bodies.nth(2))],
    ["a Context stub", () => selectAcross(page, stub, stub)],
    [
      "the key points",
      () =>
        selectAcross(page, reader(page).locator(".rd-points"), reader(page).locator(".rd-points")),
    ],
    [
      "a code block and its fold button",
      () => selectBetween(body.locator(".code"), "echo step 29", "30 lines"),
    ],
  ];

  for (const [what, select] of refused) {
    await offered(page, body);
    await select();
    await expect(popover(page), what).toBeHidden();
  }

  expect((await highlightsOf(context.request, id)).items).toEqual([]);
});
