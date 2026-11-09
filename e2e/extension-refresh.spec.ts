import { type APIRequestContext, expect, test } from "@playwright/test";

import { projectText } from "../src/core/text-projection.ts";
import { SavedItemResponseSchema } from "../src/http/schemas.ts";
import { SAME_ORIGIN } from "./access.ts";
import { itemOf } from "./api.ts";
import { ESSAY, ESSAY_AUTHOR, ESSAY_POSTED_AT, ESSAY_SENTENCE } from "./articles.ts";
import { ready, savedItemId, configuredExtensionSession } from "./extension-session.ts";
import { created, highlightsOf, selectorOf, statuses } from "./highlights.ts";

test.describe.configure({ timeout: 300_000 });

const ESSAY_TAB_TITLE = "Use the saw, fear the saw · Steph Ango";

const STALE_WORDS = Array.from({ length: 120 }, (_, index) => `stale${index}`).join(" ");

const session = configuredExtensionSession();

async function readStaleEssayWithHighlight(owner: APIRequestContext) {
  const stale = `Stale opening line. ${ESSAY_SENTENCE}. ${STALE_WORDS}`;

  const seeded = await owner.post("/api/items", {
    data: { url: ESSAY, page: { markdown: stale, title: "Stale title" } },
  });

  expect(seeded.status()).toBe(201);

  const { item } = SavedItemResponseSchema.parse(await seeded.json());
  const before = await ready(owner, item.id);

  expect(before).toMatchObject({ title: "Stale title", fetch: "ok" });

  const read = await owner.put(`/api/items/${item.id}/read-state`, {
    data: { readState: "read" },
    headers: SAME_ORIGIN,
  });

  expect(read.status()).toBe(200);

  const highlight = await created(owner, item.id, {
    target: { kind: "post" },
    revision: (await highlightsOf(owner, item.id)).revisions.post,
    selector: selectorOf(projectText(before.postText ?? ""), ESSAY_SENTENCE),
  });

  return { id: item.id, highlightId: highlight.id };
}

test("saving again keeps the id, the Read state and the Highlight of an Item, and replaces its text", async () => {
  const { library, extension } = session();
  const { owner, instance } = library;
  const { id, highlightId } = await readStaleEssayWithHighlight(owner);

  const tab = await extension.tab(ESSAY);
  await expect(tab.getByText(ESSAY_SENTENCE).first()).toBeVisible();
  expect(await tab.title()).toBe(ESSAY_TAB_TITLE);

  expect(
    await savedItemId(await extension.press(tab), instance.url),
    "the Item the first save made",
  ).toBe(id);
  await expect.poll(async () => (await itemOf(owner, id)).title).toBe(ESSAY_TAB_TITLE);

  const after = await ready(owner, id);

  expect(after).toMatchObject({
    readState: "read",
    author: ESSAY_AUTHOR,
    postedAt: ESSAY_POSTED_AT,
    fetch: "ok",
  });
  expect(after.postText).toContain(ESSAY_SENTENCE);
  expect(after.postText).not.toContain("Stale opening line");
  expect(statuses(await highlightsOf(owner, id))).toMatchObject([
    { id: highlightId, status: "attached" },
  ]);
});
