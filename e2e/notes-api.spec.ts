import { expect, test } from "@playwright/test";

import { ItemDetailResponseSchema } from "../src/http/schemas.ts";
import { agentHeaders } from "./catalog.ts";
import { screenForFile } from "./highlight-screen.ts";
import {
  NOTE_LIMIT,
  conflictIn,
  expectConsistent,
  newNoteItem,
  noteIn,
  noteOf,
  noteRows,
  putNote,
  saved,
} from "./notes.ts";
import { checkIndex, matches } from "./search.ts";
import { marker } from "./thread-fixtures.ts";

const screenOf = screenForFile();

test("one Note per Item keeps its body verbatim, advances its revision on every write and keeps the row once cleared", async () => {
  const { request } = screenOf().context;
  const itemId = await newNoteItem(screenOf(), "nw");
  const body = "  First line\n\n<b>not html</b> **not markdown** \u{1F600}  \n";

  expect(await noteOf(request, itemId), "no Note was ever saved").toEqual({
    body: null,
    revision: 0,
  });
  expect(noteRows(screenOf(), itemId)).toEqual([]);

  const first = await putNote(request, itemId, { body, revision: 0 });
  expect(first.status).toBe(200);
  expect(await noteIn(first.response)).toEqual({ body, revision: 1 });
  const [row] = noteRows(screenOf(), itemId);
  await expectConsistent(screenOf(), itemId, { body, revision: 1 });

  await saved(request, itemId, "Second text", 1);
  await expectConsistent(screenOf(), itemId, { body: "Second text", revision: 2 });

  const cleared = await putNote(request, itemId, { body: " \n\t ", revision: 2 });
  expect(await noteIn(cleared.response), "a blank body clears the Note").toEqual({
    body: null,
    revision: 3,
  });
  await expectConsistent(screenOf(), itemId, { body: null, revision: 3 });

  await saved(request, itemId, "Again", 3);
  await expectConsistent(screenOf(), itemId, { body: "Again", revision: 4 });

  const empty = await putNote(request, itemId, { body: "", revision: 4 });
  expect(await noteIn(empty.response)).toEqual({ body: null, revision: 5 });

  const [after] = noteRows(screenOf(), itemId);
  expect(after?.createdAt, "created once").toBe(row?.createdAt);
  expect(after?.updatedAt ?? 0).toBeGreaterThanOrEqual(row?.updatedAt ?? 0);
  expect(noteRows(screenOf(), itemId)).toHaveLength(1);
});

test("a Note holds 10,000 code points, and a body, a revision or an Item the route refuses changes nothing", async () => {
  const { request } = screenOf().context;
  const itemId = await newNoteItem(screenOf(), "nl");
  const emoji = "\u{1F600}";
  const atLimit = emoji.repeat(NOTE_LIMIT);

  expect(await saved(request, itemId, atLimit, 0)).toEqual({ body: atLimit, revision: 1 });

  const refused = [
    ["10,001 code points", { body: `${atLimit}a`, revision: 1 }],
    ["a lone surrogate", { body: "\uD800", revision: 1 }],
    ["a body that is not a string", { body: 5, revision: 1 }],
    ["no body", { revision: 1 }],
    ["no revision", { body: "x" }],
    ["a negative revision", { body: "x", revision: -1 }],
    ["a fractional revision", { body: "x", revision: 1.5 }],
    ["a revision that is a string", { body: "x", revision: "1" }],
  ] as const;

  for (const [name, fields] of refused) {
    expect((await putNote(request, itemId, fields)).status, name).toBe(400);
  }

  const large = await request.put(`/api/items/${itemId}/note`, {
    data: { body: "x".repeat(70_000), revision: 1 },
  });

  expect(large.status(), "a request over 64 KiB").toBe(413);
  expect((await putNote(request, itemId, { body: "x", revision: 1 })).status).toBe(200);
  expect((await putNote(request, 999_999, { body: "x", revision: 0 })).status).toBe(404);
  expect(
    (await request.put("/api/items/abc/note", { data: { body: "x", revision: 0 } })).status(),
  ).toBe(400);
  expect(await noteOf(request, itemId)).toEqual({ body: "x", revision: 2 });
});

test("a stale revision answers 409 with the current Note and changes neither the row nor the search part", async () => {
  const { request } = screenOf().context;
  const itemId = await newNoteItem(screenOf(), "ns");
  const word = marker("stale");

  await saved(request, itemId, `Current ${word}`, 0);
  const before = noteRows(screenOf(), itemId);

  for (const revision of [0, 5]) {
    const answer = await putNote(request, itemId, { body: "Rejected text", revision });
    expect(answer.status, `revision ${revision}`).toBe(409);
    expect(await conflictIn(answer.response)).toEqual({ body: `Current ${word}`, revision: 1 });
  }

  expect(noteRows(screenOf(), itemId)).toEqual(before);
  await expectConsistent(screenOf(), itemId, { body: `Current ${word}`, revision: 1 });
  expect(await matches(request, "Rejected")).toEqual([]);
});

test("two first saves at once leave one Note, and the rejected save changes nothing", async () => {
  const { request } = screenOf().context;

  const ids = await Promise.all(
    ["na", "nb", "nc", "nd"].map((tag) => newNoteItem(screenOf(), tag)),
  );

  const answers = await Promise.all(
    ids.flatMap((itemId) => [
      putNote(request, itemId, { body: `Alpha ${marker("alpha")}`, revision: 0 }),
      putNote(request, itemId, { body: `Beta ${marker("beta")}`, revision: 0 }),
    ]),
  );

  for (const [index, itemId] of ids.entries()) {
    const pair = answers.slice(index * 2, index * 2 + 2);
    expect(
      pair.map(({ status }) => status).toSorted((a, b) => a - b),
      `Item ${itemId}`,
    ).toEqual([200, 409]);

    const winner = pair.find(({ status }) => status === 200);
    const loser = pair.find(({ status }) => status === 409);

    if (winner === undefined || loser === undefined) throw new Error("one save wins");

    const note = await noteIn(winner.response);
    expect(note.revision).toBe(1);
    expect(await conflictIn(loser.response), "the loser sees the winner's Note").toEqual(note);
    await expectConsistent(screenOf(), itemId, note);
  }

  checkIndex(screenOf());
});

test("a save racing a clear, and a stale save after a clear and a new Note, each leave one consistent Note", async () => {
  const { request } = screenOf().context;
  const raced = await newNoteItem(screenOf(), "nr");
  await saved(request, raced, "Original", 0);

  const [write, clear] = await Promise.all([
    putNote(request, raced, { body: `Replacement ${marker("race")}`, revision: 1 }),
    putNote(request, raced, { body: "   ", revision: 1 }),
  ]);

  expect([write.status, clear.status].toSorted((a, b) => a - b)).toEqual([200, 409]);
  const winner = write.status === 200 ? write : clear;
  const note = await noteIn(winner.response);
  expect(note.revision).toBe(2);
  expect(note.body === null).toBe(winner === clear);
  await expectConsistent(screenOf(), raced, note);

  const later = await newNoteItem(screenOf(), "nt");
  await saved(request, later, "First", 0);
  await saved(request, later, "", 1);
  const current = await saved(request, later, `Newest ${marker("newest")}`, 2);
  expect(current.revision).toBe(3);

  const stale = await putNote(request, later, { body: `Stale ${marker("late")}`, revision: 1 });
  expect(stale.status).toBe(409);
  expect(await conflictIn(stale.response)).toEqual(current);
  await expectConsistent(screenOf(), later, current);
  expect(await matches(request, marker("late"))).toEqual([]);
});

test("an agent token reads the Note in the detail and gets 403 on PUT", async () => {
  const { request } = screenOf().context;
  const itemId = await newNoteItem(screenOf(), "no");
  const token = await agentHeaders(screenOf());

  expect((await putNote(request, itemId, { body: "Agent text", revision: 0 }, token)).status).toBe(
    403,
  );
  expect(await noteOf(request, itemId)).toEqual({ body: null, revision: 0 });
  expect(noteRows(screenOf(), itemId)).toEqual([]);

  await saved(request, itemId, "Owner text", 0);
  const asAgent = await request.get(`/api/items/${itemId}`, { headers: token });

  expect(asAgent.status()).toBe(200);
  expect(ItemDetailResponseSchema.parse(await asAgent.json()).item.note).toEqual({
    body: "Owner text",
    revision: 1,
  });
  expect((await putNote(request, itemId, { body: "Agent text", revision: 1 }, token)).status).toBe(
    403,
  );
  await expectConsistent(screenOf(), itemId, { body: "Owner text", revision: 1 });
});
