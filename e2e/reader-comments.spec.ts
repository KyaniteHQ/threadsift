import { type Page, expect, test } from "@playwright/test";

import {
  COMMENTS_TITLE,
  NONE_KEPT,
  OP_LABEL,
  SHOW_FULL_COMMENT,
  SHOW_LESS,
  STUB_DROPPED,
  STUB_MORE,
  STUB_NOT_KEPT,
  commentsButtonLabels,
  keptLabel,
} from "../web/src/reader-text.ts";
import { SAVED_COMMENT, rowKeptLabel } from "../web/src/text.ts";
import { newCode, newPassword } from "./access.ts";
import {
  comments,
  expectJumpedToComments,
  listItemDepths,
  openItem,
  sweepBar,
  visibleButtonText,
} from "./comment-reader.ts";
import {
  DetailNodesSchema,
  ListedCountsSchema,
  REPORTED,
  type Seeded,
  THREAD,
  seedThreads,
} from "./comment-thread.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import {
  DESKTOP,
  app,
  attachScreenshot,
  computed,
  fontsLoaded,
  openPanel,
  pickOption,
  px,
  viewportAt,
} from "./look.ts";
import { savedBlock, scrollAndSettle, topBlock } from "./reader-place.ts";
import { bar, crowdedControls, row, slot } from "./reader.ts";

test.describe.configure({ timeout: 300_000 });

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

const SWEEP_FROM = 750;
const SWEEP_TO = 320;
const SWEEP_STEP = 10;
const SHORT_WINDOW = 500;

const LABELS = commentsButtonLabels({ kept: THREAD.kept, total: REPORTED });

const STYLES = [
  { id: "lines", label: "Indented lines", card: "0px", split: "1px", avatar: "none" },
  { id: "cards", label: "Cards", card: "1px", split: "0px", avatar: "none" },
  { id: "rail", label: "Rail", card: "0px", split: "0px", avatar: "grid" },
] as const;

let screen: FreshScreen;
let ids: Seeded;

test.beforeAll(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
  ids = await seedThreads(screen);
});

test.afterAll(async () => {
  await screen.close();
});

async function expectStyle(page: Page, style: (typeof STYLES)[number]): Promise<void> {
  const section = comments(page);
  const dialog = await openPanel(page);
  await pickOption(dialog, "Comment style", style.label);
  await expect(app(page)).toHaveAttribute("data-comments", style.id);
  await page.keyboard.press("Escape");
  await fontsLoaded(page);
  await expect(section.locator("li.cm")).toHaveCount(THREAD.rows);
  expect(await computed(section.locator(".cm-card").first(), "border-top-width")).toBe(style.card);
  expect(await computed(section.locator("li.cm.top").first(), "border-top-width")).toBe(
    style.split,
  );
  expect(await computed(section.locator(".cm-av").first(), "display")).toBe(style.avatar);
}

test("a pasted Reddit thread shows its Kept comments, Context stubs, OP badge and count in each Comment style, and the row says how many were kept", async () => {
  const info = test.info();
  const page = await openItem(screen, DESKTOP.width, ids.thread);
  const section = comments(page);

  await expect(section.getByRole("heading", { name: COMMENTS_TITLE })).toBeVisible();
  await expect(section.getByText(keptLabel({ kept: THREAD.kept, total: REPORTED }))).toBeVisible();
  await expect(section.locator("li.cm")).toHaveCount(THREAD.rows);
  await expect(section.locator(".cm-card")).toHaveCount(THREAD.comments);
  await expect(section.locator(".cm-stub")).toHaveCount(THREAD.stubs);
  await expect(section.getByText(STUB_DROPPED)).toHaveCount(THREAD.droppedStubs);
  await expect(section.getByText(STUB_NOT_KEPT)).toHaveCount(THREAD.notKeptStubs);
  await expect(section.getByText(STUB_MORE)).toHaveCount(THREAD.moreStubs);
  await expect(section.locator("li.cm.top")).toHaveCount(THREAD.tops);
  await expect(section.locator("li.cm.deep")).toHaveCount(THREAD.deeps);
  await expect(section.locator(".op")).toHaveText(OP_LABEL);
  await expect(section.locator(".cm-card", { hasText: "u/author_one" }).locator(".op")).toHaveCount(
    1,
  );
  await expect(row(page, ids.thread).locator(".it-foot")).toContainText(
    rowKeptLabel(THREAD.kept, REPORTED),
  );

  const padding = await section
    .locator(".cm-row")
    .evaluateAll((lines) => lines.slice(0, 4).map((line) => getComputedStyle(line).paddingLeft));

  expect(padding[0], "a top-level comment is not indented").toBe("0px");
  expect(px(padding[2] ?? "0px"), "a reply is indented under its parent").toBeGreaterThan(
    px(padding[1] ?? "0px"),
  );

  const { item } = DetailNodesSchema.parse(
    await (await screen.context.request.get(`/api/items/${ids.thread}`)).json(),
  );

  expect(
    await listItemDepths(page),
    "each reply sits in a list inside its parent's list item",
  ).toEqual(item.comments.nodes.map((node) => node.depth));

  await bar(page).locator(".rd-cm").click();

  for (const style of STYLES) {
    await expectStyle(page, style);
    await attachScreenshot(page, info, `comments-${style.id}`);
  }
});

test("the Comments button names the counts, shortens as the bar narrows, and takes the reader to the section", async () => {
  const page = await openItem(screen, 1920, ids.thread);
  expect(await visibleButtonText(page)).toBe(LABELS.full);
  await expect(bar(page).locator(".rd-cm")).toHaveAccessibleName(LABELS.full);
  expect(await crowdedControls(page)).toEqual([]);

  await bar(page).locator(".rd-cm").click();
  await expectJumpedToComments(page);

  const seen = await sweepBar(page, { from: SWEEP_FROM, to: SWEEP_TO, step: SWEEP_STEP });

  const ranks = seen.map((text) => [LABELS.full, LABELS.short, LABELS.count].indexOf(text));
  expect(ranks, "only the three forms appear").not.toContain(-1);
  expect(ranks, "the label never grows as the page narrows").toEqual(
    ranks.toSorted((left, right) => left - right),
  );
  expect(new Set(ranks).size, "more than one form appears").toBeGreaterThan(1);

  await viewportAt(page, 390);
  await expect.poll(() => crowdedControls(page)).toEqual([]);
  expect([LABELS.short, LABELS.count]).toContain(await visibleButtonText(page));
  await bar(page).locator(".rd-cm").click();
  await expect(comments(page).getByRole("heading", { name: COMMENTS_TITLE })).toBeFocused();
  await attachScreenshot(page, test.info(), "comments-phone");
});

test("a long comment folds behind its button, opens, folds again from the top, and a short one has no fold", async () => {
  const page = await openItem(screen, DESKTOP.width, ids.thread);
  const section = comments(page);
  const tall = section.locator(".cm-card", { hasText: "Kept tall paragraph 1" });
  const long = section.locator(".cm-card", { hasText: "Kept long paragraph 1" });
  const short = section.locator(".cm-card", { hasText: "Kept three." });

  await expect(short.locator(".cm-more")).toHaveCount(0);
  await expect(tall.locator(".cm-fold")).toHaveClass(/folded/u);
  await tall.getByRole("button", { name: SHOW_FULL_COMMENT }).click();
  await expect(tall.locator(".cm-fold")).not.toHaveClass(/folded/u);
  await expect(tall.getByRole("button", { name: SHOW_LESS })).toHaveCount(1);
  await tall.getByRole("button", { name: SHOW_LESS }).click();
  await expect(tall.locator(".cm-fold")).toHaveClass(/folded/u);

  await long.getByRole("button", { name: SHOW_FULL_COMMENT }).click();
  await expect(long.getByRole("button", { name: SHOW_LESS })).toHaveCount(2);
  await long.getByRole("button", { name: SHOW_LESS }).first().click();
  await expect(long.locator(".cm-fold")).toHaveClass(/folded/u);
  await expect(long.getByRole("button", { name: SHOW_FULL_COMMENT })).toBeFocused();
});

test("the reading place inside the comments survives a reload, and a reload from inside an opened comment lands on that comment folded", async () => {
  const page = await openItem(screen, DESKTOP.width, ids.thread);
  await page.setViewportSize({ width: DESKTOP.width, height: SHORT_WINDOW });

  await slot(page).evaluate((element) => {
    const target = element.querySelector("li.cm.top");
    const barHeight = element.querySelector(".rd-bar")?.getBoundingClientRect().height ?? 0;

    if (target !== null)
      element.scrollTop +=
        target.getBoundingClientRect().top - element.getBoundingClientRect().top - barHeight;
  });

  const block = await topBlock(page);
  expect(block, "the block at the top is a comment's").toContain("Kept");
  await expect.poll(() => savedBlock(page, ids.thread)).toBe(block);

  await page.reload();
  await expect(comments(page)).toBeVisible();
  await expect.poll(() => topBlock(page)).toBe(block);

  const long = comments(page).locator(".cm-card", { hasText: "Kept long paragraph 1" });
  await long.getByRole("button", { name: SHOW_FULL_COMMENT }).click();
  const deep = await scrollAndSettle(page, ids.thread, 0.8);
  expect(deep, "the block at the top is inside the open comment").toContain("Kept long paragraph");

  await page.reload();
  await expect(comments(page)).toBeVisible();
  await expect(long).toBeInViewport();
  await expect(long.locator(".cm-fold")).toHaveClass(/folded/u);
});

test("a saved Reddit comment's row says Saved comment, a post's row says how many comments were kept, and a thread with none kept says so", async () => {
  const page = await openItem(screen, DESKTOP.width, ids.thread);

  await expect(row(page, ids.saved).locator(".it-foot")).toContainText(SAVED_COMMENT);
  await expect(row(page, ids.thread).locator(".it-foot")).toContainText(
    rowKeptLabel(THREAD.kept, REPORTED),
  );
  await expect(row(page, ids.none).locator(".it-foot")).toContainText(rowKeptLabel(0, REPORTED));

  const listed = ListedCountsSchema.parse(
    await (await screen.context.request.get("/api/items")).json(),
  );

  const countsOf = (id: number) => listed.items.find((item) => item.id === id);
  expect(countsOf(ids.thread)).toMatchObject({
    commentsKept: THREAD.kept,
    commentsTotal: REPORTED,
  });
  expect(countsOf(ids.none)).toMatchObject({ commentsKept: 0, commentsTotal: REPORTED });

  await row(page, ids.none).locator("a.it-open").click();
  await expect(comments(page).getByText(NONE_KEPT)).toBeVisible();
  await expect(bar(page).locator(".rd-cm")).toHaveCount(0);

  await row(page, ids.saved).locator("a.it-open").click();
  await expect(comments(page).locator(".cm-card")).toHaveCount(1);
});
