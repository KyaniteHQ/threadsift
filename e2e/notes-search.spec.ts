import { expect, test } from "@playwright/test";

import { SAME_ORIGIN } from "./access.ts";
import { itemOf } from "./api.ts";
import { agentHeaders } from "./catalog.ts";
import { screenForFile } from "./highlight-screen.ts";
import { putPost } from "./highlights.ts";
import {
  expectConsistent,
  newNoteItem,
  noteOf,
  noteParts,
  noteRows,
  partsBesidesNote,
  saved,
} from "./notes.ts";
import { checkIndex, matches } from "./search.ts";
import { marker, post, postUrl, run } from "./thread-fixtures.ts";
import { AUTHORED_DIGEST, threadJson } from "./threads.ts";

const screenOf = screenForFile();

test("a Note is found by a word in it, the search follows each edit and clear, and the index stays intact", async () => {
  const { request } = screenOf().context;
  const itemId = await newNoteItem(screenOf(), "nf");
  const other = await newNoteItem(screenOf(), "ng");
  const first = marker("first");
  const second = marker("second");
  const beside = partsBesidesNote(screenOf(), itemId);

  await saved(request, itemId, `Remember ${first} for the talk`, 0);
  expect(await matches(request, first)).toEqual([itemId]);
  expect(await matches(request, `${first} talk`), "two words of one Note").toEqual([itemId]);
  expect(noteParts(screenOf(), itemId)).toHaveLength(1);

  await saved(request, itemId, `Remember ${second} instead`, 1);
  expect(await matches(request, first)).toEqual([]);
  expect(await matches(request, second)).toEqual([itemId]);
  expect(noteParts(screenOf(), itemId)).toHaveLength(1);

  await saved(request, itemId, "  ", 2);
  expect(await matches(request, second)).toEqual([]);
  expect(noteParts(screenOf(), itemId)).toEqual([]);

  expect(partsBesidesNote(screenOf(), itemId), "no other part was rewritten").toEqual(beside);
  expect(noteParts(screenOf(), other)).toEqual([]);
  checkIndex(screenOf());
});

test("a refresh, a new Digest and an agent's Digest never rewrite the Note", async () => {
  const { request } = screenOf().context;
  const id = `nu${run}`;
  const itemId = await putPost(request, id, "Original text of the thread.");
  const token = await agentHeaders(screenOf());
  const note = await saved(request, itemId, `Kept ${marker("kept")}`, 0);
  const before = noteRows(screenOf(), itemId);

  await putPost(request, id, "A refreshed text that replaces the first one.");
  expect(await noteOf(request, itemId)).toEqual(note);

  for (const headers of [{}, token]) {
    const response = await request.post("/api/items", {
      headers,
      data: {
        url: postUrl(id),
        content: threadJson(post(id, "Text sent with a Digest."), []),
        digest: { ...AUTHORED_DIGEST, title: `Digest ${marker("digest")}` },
      },
    });

    expect(response.status()).toBeLessThan(300);
  }

  await expect.poll(async () => (await itemOf(request, itemId)).digestTitle).toContain("Digest ");
  await expectConsistent(screenOf(), itemId, note);
  expect(noteRows(screenOf(), itemId)).toEqual(before);
});

test("deleting an Item removes its Note row, cleared or not, and its search part, and leaves other Notes", async () => {
  const { request } = screenOf().context;
  const withNote = await newNoteItem(screenOf(), "nx");
  const cleared = await newNoteItem(screenOf(), "ny");
  const kept = await newNoteItem(screenOf(), "nz");
  const word = marker("gone");

  await saved(request, withNote, `Doomed ${word}`, 0);
  await saved(request, cleared, "Short lived", 0);
  await saved(request, cleared, "", 1);
  const survivor = `Survivor ${marker("survivor")}`;
  await saved(request, kept, survivor, 0);
  expect(noteRows(screenOf(), cleared)).toHaveLength(1);

  for (const id of [withNote, cleared]) {
    expect((await request.delete(`/api/items/${id}`, { headers: SAME_ORIGIN })).status()).toBe(204);
    expect(noteRows(screenOf(), id)).toEqual([]);
    expect(noteParts(screenOf(), id)).toEqual([]);
  }

  expect(await matches(request, word)).toEqual([]);
  await expectConsistent(screenOf(), kept, { body: survivor, revision: 1 });
  checkIndex(screenOf());
});
