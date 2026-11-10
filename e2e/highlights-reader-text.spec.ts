import { type Locator, type Page, expect, test } from "@playwright/test";

import { STUB_NOT_KEPT } from "../web/src/reader-text.ts";
import {
  keepButton,
  markedText,
  openReader,
  popover,
  seedThread,
  selectBetween,
} from "./highlight-reader.ts";
import { keepThroughApi, screenForFile } from "./highlight-screen.ts";
import { highlightsOf } from "./highlights.ts";
import { DESKTOP } from "./look.ts";
import { reader } from "./reader.ts";
import { run } from "./thread-fixtures.ts";
import { comment } from "./threads.ts";

const screenOf = screenForFile();

const KEY_POINT = "The cache path matters.";

const CONSTRUCTS = [
  "Intro paragraph with 😀 and 🐙 emoji, plus a hard  \nbreak line here.",
  "| left | right |\n|---|---|\n| alpha | beta |\n| gamma | delta |",
  "```sh\nmkdir -p cache\nls cache\n```",
  "![diagram of cache](https://example.com/cache.png)",
  "- [ ] open task item\n- [x] done task item",
  "> A quoted line\n> with a second line",
  "Raw <b>html</b> stays text, and a footnote[^1] follows.\n\n[^1]: The footnote text.",
  "1. first step\n2. second step\n   - nested step",
  "![hello world](https://example.com/hello.png)",
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
  ["world", "world", "world"],
] as const;

const seeded = { constructs: 0 };

test.beforeAll(async () => {
  seeded.constructs = await seedThread(screenOf(), { id: `t${run}`, text: CONSTRUCTS });
});

for (const [from, to, exact] of CASES) {
  test(`a passage from ${JSON.stringify(from)} to ${JSON.stringify(to)} is accepted by the server and marked over the same text`, async () => {
    const { page, context } = screenOf();

    await openReader(page, seeded.constructs, DESKTOP.width);
    const body = reader(page).locator(".md").first();
    const before = (await highlightsOf(context.request, seeded.constructs)).items.length;

    await selectBetween(body, from, to);
    await expect(keepButton(page), exact).toBeVisible();
    await keepButton(page).click();
    await expect(popover(page)).toBeHidden();

    await expect
      .poll(async () => (await highlightsOf(context.request, seeded.constructs)).items.length, {
        message: exact,
      })
      .toBe(before + 1);

    const saved = (await highlightsOf(context.request, seeded.constructs)).items.at(-1);
    expect(saved?.selector.exact, exact).toBe(exact);
    expect(saved?.status, exact).toBe("attached");

    const shown = body.locator(`mark[data-highlights~="${saved?.id ?? 0}"]`);
    await expect(shown.first(), exact).toBeVisible();
    expect((await shown.allTextContents()).join("").replaceAll(/\s+/gu, ""), exact).toBe(
      exact.replaceAll(/\s+/gu, ""),
    );
  });
}

test("every passage kept over the constructs is still attached after a reload", async () => {
  const { page, context } = screenOf();

  await openReader(page, seeded.constructs, DESKTOP.width);
  await expect(reader(page).locator("mark[data-highlights]").first()).toBeVisible();
  expect(
    (await highlightsOf(context.request, seeded.constructs)).items.map((item) => item.status),
  ).toEqual(CASES.map(() => "attached"));
});

test("a passage after a code block that ends in a blank line is accepted by the server and marked", async () => {
  const { page, context } = screenOf();
  const text = "~~~\na\n\n~~~\n\nAfter text";
  const id = await seedThread(screenOf(), { id: `v${run}`, text });

  await openReader(page, id, DESKTOP.width);
  const body = reader(page).locator(".md").first();

  await selectBetween(body, "After text", "After text");
  await keepButton(page).click();
  await expect.poll(() => markedText(body)).toBe("After text");
  expect((await highlightsOf(context.request, id)).items.map((item) => item.status)).toEqual([
    "attached",
  ]);
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
  const { page, context } = screenOf();

  const id = await seedThread(screenOf(), {
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

  await keepThroughApi(screenOf(), id, [["post", "A closing paragraph"]]);
  await openReader(page, id, DESKTOP.width);
  const body = reader(page).locator(".md").first();
  const stub = reader(page).locator(".cm-stub").first();

  const refused: readonly (readonly [string, () => Promise<void>])[] = [
    ["the post and a comment", () => selectBetween(reader(page), "A closing", "A kept reply")],
    ["two comments", () => selectBetween(reader(page), "A kept reply", "A second kept remark")],
    ["a Context stub", () => selectBetween(stub, STUB_NOT_KEPT, STUB_NOT_KEPT)],
    [
      "the key points",
      () => selectBetween(reader(page).locator(".rd-points"), KEY_POINT, KEY_POINT),
    ],
    [
      "a saved Highlight's list quote",
      () => selectBetween(reader(page).locator(".hl-quote"), "A closing", "paragraph"),
    ],
    [
      "the Summary text",
      () => selectBetween(reader(page).locator(".rd-summary"), "thread to select", "passages"),
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

  expect((await highlightsOf(context.request, id)).items).toHaveLength(1);
});
