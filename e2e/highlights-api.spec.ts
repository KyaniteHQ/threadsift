import { type APIRequestContext, expect, test } from "@playwright/test";

import { ItemDetailResponseSchema } from "../src/http/schemas.ts";
import { newCode, newPassword } from "./access.ts";
import { itemOf } from "./api.ts";
import { agentHeaders } from "./catalog.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import {
  POST,
  createHighlight,
  created,
  highlightIn,
  highlightParts,
  highlightsOf,
  indexOf,
  postRevision,
  putPost,
  removeHighlight,
  selectorOf,
  statuses,
} from "./highlights.ts";
import { tickNow } from "./ingest.ts";
import { matches, sweptTo } from "./search.ts";
import { marker, run } from "./thread-fixtures.ts";

test.describe.configure({ timeout: 240_000 });

test.use({ trace: "off", video: "off", screenshot: "off" });

let screen: FreshScreen;

test.beforeEach(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
});

test.afterEach(async () => {
  await screen.close();
});

const QUOTED = marker("quoted");

const BODY = `Before the line. The ${QUOTED} line stays.\n\nAfter the line.`;

const PROJECTION = `Before the line. The ${QUOTED} line stays.\nAfter the line.`;

type Selected = ReturnType<typeof selectorOf>;

async function expectRefusals(
  request: APIRequestContext,
  itemId: number,
  revision: number,
  selector: Readonly<Selected>,
): Promise<void> {
  const refused = [
    ["a hint one code point off", { ...selector, hint: selector.hint + 1 }],
    ["a wrong prefix", { ...selector, prefix: "x" }],
    ["a wrong suffix", { ...selector, suffix: "x" }],
    ["a quote that is not in the text", { ...selector, exact: "not in the text" }],
    ["an empty quote", { ...selector, exact: "" }],
    ["a blank quote", { ...selector, exact: "   " }],
    ["a lone surrogate", { ...selector, exact: "\uD800" }],
  ] as const;

  for (const [name, bad] of refused) {
    const answer = await createHighlight(request, itemId, {
      target: POST,
      revision,
      selector: bad,
    });

    expect(answer.status, name).toBe(400);
  }

  const malformed = await request.post(`/api/items/${itemId}/highlights`, {
    data: { revision, selector },
  });

  expect(malformed.status(), "a body without a target").toBe(400);
}

test("a create is refused for an outdated revision, a quote that is not there, an empty quote and an unknown target", async () => {
  const { request } = screen.context;
  const itemId = await putPost(request, `a${run}`, BODY);
  const revision = await postRevision(request, itemId);
  const selector = selectorOf(PROJECTION, `The ${QUOTED} line`);

  const stale = await createHighlight(request, itemId, {
    target: POST,
    revision: revision - 1,
    selector,
  });

  expect(stale.status).toBe(409);
  expect(await stale.response.json()).toEqual({
    error: expect.stringContaining("GET /api/items/{id}"),
  });

  await expectRefusals(request, itemId, revision, selector);

  const comment = await createHighlight(request, itemId, {
    target: { kind: "comment", commentId: "t1_absent" },
    revision,
    selector,
  });

  expect(comment.status, "a comment the thread does not have").toBe(404);

  const unknown = await createHighlight(request, 999_999, { target: POST, revision, selector });
  expect(unknown.status).toBe(404);

  expect((await highlightsOf(request, itemId)).items).toEqual([]);
});

test("a repeat of the same passage of the same revision answers the saved Highlight and saves nothing", async () => {
  const { request } = screen.context;
  const itemId = await putPost(request, `d${run}`, BODY);
  const revision = await postRevision(request, itemId);
  const fields = { target: POST, revision, selector: selectorOf(PROJECTION, `The ${QUOTED} line`) };

  const first = await created(request, itemId, fields);
  const again = await createHighlight(request, itemId, fields);

  expect(again.status).toBe(200);
  expect((await highlightIn(again.response)).id).toBe(first.id);
  expect((await highlightsOf(request, itemId)).items).toHaveLength(1);
});

test("two Highlights of one quote each own one search part, and a remove ends only its own", async () => {
  const { request } = screen.context;
  const itemId = await putPost(request, `m${run}`, `${QUOTED} one.\n\n${QUOTED} two.`);
  const revision = await postRevision(request, itemId);
  const projection = `${QUOTED} one.\n${QUOTED} two.`;

  const first = await created(request, itemId, {
    target: POST,
    revision,
    selector: selectorOf(projection, QUOTED, 0),
  });

  const second = await created(request, itemId, {
    target: POST,
    revision,
    selector: selectorOf(projection, QUOTED, 1),
  });

  expect(highlightParts(screen, itemId)).toEqual([
    { highlightId: first.id, body: QUOTED },
    { highlightId: second.id, body: QUOTED },
  ]);

  expect(await removeHighlight(request, itemId, first.id)).toBe(204);
  expect(highlightParts(screen, itemId)).toEqual([{ highlightId: second.id, body: QUOTED }]);
  expect(await matches(request, QUOTED)).toEqual([itemId]);
});

test("an agent token reads Highlights and gets 403 on create and remove", async () => {
  const { request } = screen.context;
  const itemId = await putPost(request, `o${run}`, BODY);
  const revision = await postRevision(request, itemId);
  const fields = { target: POST, revision, selector: selectorOf(PROJECTION, `The ${QUOTED} line`) };
  const token = await agentHeaders(screen);

  expect((await createHighlight(request, itemId, fields, token)).status).toBe(403);
  expect((await highlightsOf(request, itemId)).items).toEqual([]);

  const saved = await created(request, itemId, fields);
  const asAgent = await request.get(`/api/items/${itemId}`, { headers: token });

  expect(asAgent.status()).toBe(200);
  expect(
    ItemDetailResponseSchema.parse(await asAgent.json()).item.highlights.items.map(({ id }) => id),
  ).toEqual([saved.id]);

  expect(await removeHighlight(request, itemId, saved.id, token)).toBe(403);
  expect((await highlightsOf(request, itemId)).items).toHaveLength(1);
});

test("the owner's remove is scoped to its Item, answers 404 for a repeat, and takes the Highlight out of search once", async () => {
  const { request } = screen.context;
  const itemId = await putPost(request, `r${run}`, BODY);
  const otherId = await putPost(request, `p${run}`, "Another Item with other words.");
  const revision = await postRevision(request, itemId);
  const fields = { target: POST, revision, selector: selectorOf(PROJECTION, `The ${QUOTED} line`) };
  const saved = await created(request, itemId, fields);

  expect(await removeHighlight(request, otherId, saved.id), "another Item's id").toBe(404);
  expect(await removeHighlight(request, itemId, 999_999), "an unknown Highlight").toBe(404);
  expect((await highlightsOf(request, itemId)).items).toHaveLength(1);

  expect(await removeHighlight(request, itemId, saved.id)).toBe(204);
  expect(await removeHighlight(request, itemId, saved.id), "a repeat").toBe(404);
  expect((await itemOf(request, itemId)).highlights.items).toEqual([]);
  expect(await matches(request, QUOTED)).toEqual([itemId]);
});

test("an unattached Highlight is found by its quote alone, the search reconciler writes its part again when it is missing, and removing it ends the search entry", async () => {
  const { request } = screen.context;
  const word = marker("only");
  const id = `u${run}`;
  const itemId = await putPost(request, id, `Before. The ${word} line stays.`);
  const selector = selectorOf(`Before. The ${word} line stays.`, `The ${word} line`);

  const saved = await created(request, itemId, {
    target: POST,
    revision: await postRevision(request, itemId),
    selector,
  });

  expect(await putPost(request, id, "A replacement text that quotes nothing.")).toBe(itemId);
  expect(statuses(await highlightsOf(request, itemId))).toMatchObject([
    { id: saved.id, status: "gone" },
  ]);
  expect(await matches(request, word), "the quote alone keeps the Item findable").toEqual([itemId]);

  screen.fresh.sql(`DELETE FROM search_parts WHERE item_id = ${itemId} AND kind = 'highlight'`);
  expect(await matches(request, word)).toEqual([]);

  await sweptTo(screen, word, [itemId]);
  expect(highlightParts(screen, itemId)).toEqual([{ highlightId: saved.id, body: selector.exact }]);

  const stray = marker("stray");

  screen.fresh.sql(
    `INSERT INTO search_parts (item_id, kind, body) VALUES (${itemId}, 'highlight', '${stray}'); UPDATE search_parts SET body = '${stray}x' WHERE highlight_id = ${saved.id}`,
  );
  await sweptTo(screen, stray, []);
  await sweptTo(screen, word, [itemId]);
  expect(highlightParts(screen, itemId)).toEqual([{ highlightId: saved.id, body: selector.exact }]);

  expect(await removeHighlight(request, itemId, saved.id)).toBe(204);
  expect(await matches(request, word)).toEqual([]);
});

test("a create and a remove rewrite only the Highlight parts, and the reconciler leaves the rest of the Item's index alone", async () => {
  const { request } = screen.context;
  const word = marker("canary");
  const itemId = await putPost(request, `i${run}`, BODY);
  const canaryId = await putPost(request, `c${run}`, `A canary text with ${word} in it.`);

  await expect
    .poll(
      async () => {
        await tickNow(request, screen.fresh);

        return indexOf(screen, itemId)[0]?.fingerprint ?? null;
      },
      { timeout: 150_000, intervals: [2000] },
    )
    .not.toBeNull();

  const before = indexOf(screen, itemId);

  const saved = await created(request, itemId, {
    target: POST,
    revision: await postRevision(request, itemId),
    selector: selectorOf(PROJECTION, `The ${QUOTED} line`),
  });

  screen.fresh.sql(
    `DELETE FROM search_parts WHERE item_id = ${canaryId}; DELETE FROM search_fingerprints WHERE item_id = ${canaryId}`,
  );
  await sweptTo(screen, word, [canaryId]);

  expect(indexOf(screen, itemId), "the reconciler rewrote nothing of the Item").toEqual(before);

  expect(await removeHighlight(request, itemId, saved.id)).toBe(204);
  screen.fresh.sql(
    `DELETE FROM search_parts WHERE item_id = ${canaryId}; DELETE FROM search_fingerprints WHERE item_id = ${canaryId}`,
  );
  await sweptTo(screen, word, [canaryId]);

  expect(indexOf(screen, itemId)).toEqual(before);
});
