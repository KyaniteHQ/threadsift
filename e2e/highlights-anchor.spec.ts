import { expect, test } from "@playwright/test";

import { newCode, newPassword } from "./access.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import {
  CONTEXT_CODE_POINTS,
  POST,
  createHighlight,
  created,
  highlightsOf,
  postRevision,
  putPost,
  selectorOf,
  statuses,
} from "./highlights.ts";
import { run } from "./thread-fixtures.ts";

test.describe.configure({ timeout: 240_000 });

test.use({ trace: "off", video: "off", screenshot: "off" });

let screen: FreshScreen;

test.beforeEach(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
});

test.afterEach(async () => {
  await screen.close();
});

const STRUCTURED = [
  "Use **bold words** and a [link text](https://example.com/a) here.",
  "",
  "Second paragraph starts here.",
  "",
  "```js",
  "const answer = 42;",
  "```",
].join("\n");

const STRUCTURED_PROJECTION =
  "Use bold words and a link text here.\nSecond paragraph starts here.\nconst answer = 42;";

test("a quote across emphasis and a link, across a block boundary and inside code is saved and found again after a refresh with the same text", async () => {
  const { request } = screen.context;
  const id = `s${run}`;
  const itemId = await putPost(request, id, STRUCTURED);
  const revision = await postRevision(request, itemId);

  const quotes = [
    "bold words and a link text",
    "here.\nSecond paragraph",
    "answer = 42",
    STRUCTURED_PROJECTION,
  ];

  const saved = [];

  for (const quote of quotes) {
    const selector = selectorOf(STRUCTURED_PROJECTION, quote);
    const highlight = await created(request, itemId, { target: POST, revision, selector });
    expect(highlight, quote).toMatchObject({ status: "attached", revision, start: selector.hint });
    saved.push({ id: highlight.id, start: selector.hint });
  }

  await putPost(request, id, STRUCTURED);

  const after = await highlightsOf(request, itemId);
  expect(after.revisions.post).toBe(revision + 1);

  expect(
    after.items.map((highlight) => ({
      id: highlight.id,
      status: highlight.status,
      revision: highlight.revision,
      start: highlight.status === "attached" ? highlight.start : null,
    })),
  ).toEqual(
    saved.map(({ id: highlightId, start }) => ({
      id: highlightId,
      status: "attached",
      revision: revision + 1,
      start,
    })),
  );
});

const RULES = [
  "Fish &amp; chips and <b>raw</b> html",
  "soft  wrap  ",
  "hard\\",
  "break ![chart alt](https://example.com/c.png) ![](https://example.com/bare.png) ![](relative.png)",
  "",
  "- [x] done task",
  "- plain item[^1]",
  "  - nested *item*",
  "",
  "> quoted",
  "> lines",
  "",
  "| head a | head b |",
  "|---|---|",
  "| cell `c d` | |",
  "| x | y |",
  "",
  "[^1]: Footnote *text*.",
].join("\n");

const RULES_PROJECTION = [
  "Fish & chips and <b>raw</b> html soft wrap",
  "hard",
  "break chart alt https://example.com/bare.png",
  "done task",
  "plain item",
  "nested item",
  "quoted lines",
  "head a\thead b",
  "cell c d\t",
  "x\ty",
  "Footnote text.",
].join("\n");

test("the saved text is what the Reader shows: entities, breaks, image alt text, task markers, tables, quotes, footnotes and raw HTML", async () => {
  const { request } = screen.context;
  const itemId = await putPost(request, `r${run}`, RULES);
  const revision = await postRevision(request, itemId);

  const selector = selectorOf(RULES_PROJECTION, RULES_PROJECTION);
  const whole = await created(request, itemId, { target: POST, revision, selector });
  expect(whole).toMatchObject({ status: "attached", start: 0 });

  for (const quote of [
    "& chips",
    "soft wrap\nhard\nbreak",
    "alt https",
    "cell c d\t\nx\ty",
    "text.",
  ]) {
    const part = selectorOf(RULES_PROJECTION, quote);
    expect(
      await created(request, itemId, { target: POST, revision, selector: part }),
      quote,
    ).toMatchObject({
      status: "attached",
      start: part.hint,
    });
  }
});

const TWICE = "Intro one. The cache is cold.\n\nIntro two. The cache is cold.";
const TWICE_PROJECTION = "Intro one. The cache is cold.\nIntro two. The cache is cold.";
const PASSAGE = "The cache is cold.";

test("of two identical passages the saved one is found after a refresh, an edit that leaves two equal matches makes it ambiguous, and a quote that goes and returns detaches and attaches again", async () => {
  const { request } = screen.context;
  const id = `d${run}`;
  const itemId = await putPost(request, id, TWICE);
  const revision = await postRevision(request, itemId);

  const second = selectorOf(TWICE_PROJECTION, PASSAGE, 1);
  const first = selectorOf(TWICE_PROJECTION, PASSAGE, 0);
  const saved = await created(request, itemId, { target: POST, revision, selector: second });
  expect(saved).toMatchObject({ status: "attached", start: second.hint });
  expect(second.hint).toBeGreaterThan(first.hint);

  await putPost(request, id, TWICE);
  expect(statuses(await highlightsOf(request, itemId))).toEqual([
    { id: saved.id, status: "attached", revision: revision + 1, start: second.hint },
  ]);

  await putPost(
    request,
    id,
    TWICE.replaceAll(/Intro (?:one|two)\./gu, "Same lead.").concat(" Same tail."),
  );
  expect(statuses(await highlightsOf(request, itemId))).toEqual([
    { id: saved.id, status: "ambiguous", revision: revision + 2, start: null },
  ]);

  await putPost(request, id, "Intro one. The cache is cold.");
  expect(statuses(await highlightsOf(request, itemId))).toEqual([
    { id: saved.id, status: "attached", revision: revision + 3, start: first.hint },
  ]);

  await putPost(request, id, "The cache was warm all along.");
  const gone = await highlightsOf(request, itemId);
  expect(statuses(gone)).toEqual([
    { id: saved.id, status: "gone", revision: revision + 4, start: null },
  ]);
  expect(gone.items[0]?.selector).toEqual(second);

  await putPost(request, id, TWICE);
  expect(statuses(await highlightsOf(request, itemId))).toEqual([
    { id: saved.id, status: "attached", revision: revision + 5, start: second.hint },
  ]);
});

test("context is scored by whole code points, so two different supplementary characters are not a partial match", async () => {
  const { request } = screen.context;
  const id = `e${run}`;
  const itemId = await putPost(request, id, "xQ\u{1F600}");
  const revision = await postRevision(request, itemId);
  const selector = selectorOf("xQ\u{1F600}", "Q");
  const saved = await created(request, itemId, { target: POST, revision, selector });

  expect(selector).toEqual({ exact: "Q", prefix: "x", suffix: "\u{1F600}", hint: 1 });

  await putPost(request, id, "yQ\u{1F601} zQX");
  expect(statuses(await highlightsOf(request, itemId))).toEqual([
    { id: saved.id, status: "ambiguous", revision: revision + 1, start: null },
  ]);
});

test("a quote with more than 32 supplementary characters on each side keeps exactly 32 code points of context, and any other size is refused", async () => {
  const { request } = screen.context;
  const before = "\u{1F600}".repeat(40);
  const after = "\u{1F601}".repeat(40);
  const text = `${before}Q${after}`;
  const itemId = await putPost(request, `l${run}`, text);
  const revision = await postRevision(request, itemId);
  const selector = selectorOf(text, "Q");

  expect(Array.from(selector.prefix)).toHaveLength(CONTEXT_CODE_POINTS);
  expect(Array.from(selector.suffix)).toHaveLength(CONTEXT_CODE_POINTS);

  const saved = await created(request, itemId, { target: POST, revision, selector });

  expect(saved.selector).toEqual(selector);
  expect(saved).toMatchObject({ status: "attached", start: 40 });

  const sized = [
    [
      "a prefix of 31 code points",
      { ...selector, prefix: Array.from(selector.prefix).slice(1).join("") },
    ],
    ["a prefix of 33 code points", { ...selector, prefix: `\u{1F600}${selector.prefix}` }],
    [
      "a suffix of 31 code points",
      { ...selector, suffix: Array.from(selector.suffix).slice(1).join("") },
    ],
    ["a suffix of 33 code points", { ...selector, suffix: `${selector.suffix}\u{1F601}` }],
  ] as const;

  for (const [name, bad] of sized) {
    const answer = await createHighlight(request, itemId, {
      target: POST,
      revision,
      selector: bad,
    });

    expect(answer.status, name).toBe(400);
  }

  expect((await highlightsOf(request, itemId)).items).toHaveLength(1);
});
