import { expect, test } from "@playwright/test";

import { projectText } from "../src/core/text-projection.ts";
import { screenForFile } from "./highlight-screen.ts";
import { FIRST_DATE, dateHighlight, keepNote, keepWords, wordAt } from "./highlights-page-seed.ts";
import { PAGE_SIZE, allPages, pageAt, pageOf } from "./highlights-page.ts";
import { POST, created, postRevision, putPost, selectorOf } from "./highlights.ts";
import { saved } from "./notes.ts";
import { run } from "./thread-fixtures.ts";

const screenOf = screenForFile(900_000);

const HIGHLIGHTS = 120;

const STEP = 10;

interface Held {
  readonly kind: "highlight" | "note";
  readonly id: number;
  readonly date: number;
}

const model: Held[] = [];

function laterKind(left: Held, right: Held): number {
  if (left.kind === right.kind) return 0;

  return left.kind === "note" ? -1 : 1;
}

function newestFirst(): Held[] {
  return model.toSorted(
    (left, right) => right.date - left.date || laterKind(left, right) || right.id - left.id,
  );
}

function keysOf(entries: readonly Held[]): string[] {
  return entries.map(({ kind, id }) => `${kind}:${String(id)}`);
}

test.beforeAll(async () => {
  const screen = screenOf();

  await keepWords(screen, "pg", HIGHLIGHTS, (id, index) => {
    const date = FIRST_DATE + index * STEP;
    dateHighlight(screen, id, date);
    model.push({ kind: "highlight", id, date });
  });

  const noteDates = [70 * STEP, 30 * STEP, 10 * STEP + 5, 5 * STEP + 5];

  for (const [index, offset] of noteDates.entries()) {
    const owner = await putPost(
      screen.context.request,
      `pn${String(index)}${run}`,
      `A post number ${index}.`,
    );

    await keepNote(screen, owner, `Note number ${index}`, FIRST_DATE + offset);
    model.push({ kind: "note", id: owner, date: FIRST_DATE + offset });
  }
});

test("every page holds 50 entries, newest first, and the pages together hold each Highlight and Note once", async () => {
  const pages = await allPages(screenOf().context.request);
  const expected = newestFirst();

  expect(pages.map(({ entries }) => entries.length)).toEqual([PAGE_SIZE, PAGE_SIZE, 24]);
  expect(pages.map(({ next }) => next === null)).toEqual([false, false, true]);
  expect(pages.map(({ counts }) => counts.total)).toEqual([124, 124, 124]);

  expect(keysOf(pages.flatMap(({ entries }) => entries))).toEqual(keysOf(expected));
});

test("a Highlight and a Note with the same date are split across the page edge without a repeat or a gap", async () => {
  const { request } = screenOf().context;
  const first = await pageOf(request);
  const second = await pageOf(request, { cursor: first.next ?? "" });
  const edge = newestFirst();

  expect(edge[PAGE_SIZE - 1]?.kind, "the last entry of page 1").toBe("note");
  expect(edge[PAGE_SIZE]?.kind, "the first entry of page 2").toBe("highlight");
  expect(edge[PAGE_SIZE - 1]?.date).toBe(edge[PAGE_SIZE]?.date);
  expect(keysOf(first.entries.slice(-1))).toEqual(keysOf(edge.slice(PAGE_SIZE - 1, PAGE_SIZE)));
  expect(keysOf(second.entries.slice(0, 1))).toEqual(keysOf(edge.slice(PAGE_SIZE, PAGE_SIZE + 1)));
});

test("a cursor older than every entry answers an empty last page, and one that is made up answers 400", async () => {
  const { request } = screenOf().context;
  const oldest = newestFirst().at(-1);
  const cursor = `${String(oldest?.date)}.${oldest?.kind}.${String(oldest?.id)}`;

  expect(await pageOf(request, { cursor })).toMatchObject({ entries: [], next: null });
  expect((await pageAt(request, { cursor: "12.bookmark.3" })).status).toBe(400);
  expect((await pageAt(request, { cursor: "-1.note.3" })).status).toBe(400);
});

test("a Highlight added between two page reads shows at the top of a new read and costs the old read no repeat and no gap", async () => {
  const screen = screenOf();
  const { request } = screen.context;
  const before = newestFirst();
  const first = await pageOf(request);
  const text = `${wordAt(0)} appears once, and this new passage comes later.`;
  const itemId = await putPost(request, `pa${run}`, text);

  const { id } = await created(request, itemId, {
    target: POST,
    revision: await postRevision(request, itemId),
    selector: selectorOf(projectText(text), "this new passage"),
  });

  const rest: Awaited<ReturnType<typeof pageOf>>[] = [];
  let cursor = first.next;

  while (cursor !== null) {
    const page = await pageOf(request, { cursor });
    rest.push(page);
    cursor = page.next;
  }

  expect(keysOf([...first.entries, ...rest.flatMap(({ entries }) => entries)])).toEqual(
    keysOf(before),
  );

  const fresh = await pageOf(request);

  expect(fresh.entries[0]).toMatchObject({ kind: "highlight", id, text: "this new passage" });
  expect(fresh.counts.total).toBe(before.length + 1);
  expect(keysOf(fresh.entries.slice(1))).toEqual(keysOf(before.slice(0, PAGE_SIZE - 1)));

  const added = fresh.entries[0];
  model.push({ kind: "highlight", id, date: added?.date ?? 0 });
});

test("clearing the Note that a cursor names, between two reads, leaves the next page as it was", async () => {
  const { request } = screenOf().context;
  const named = model.find(({ kind, date }) => kind === "note" && date === FIRST_DATE + 70 * STEP);
  const ordered = newestFirst();
  const at = ordered.findIndex((held) => held === named);
  const cursor = `${String(named?.date)}.note.${String(named?.id)}`;

  await saved(request, named?.id ?? 0, "", 1);

  const page = await pageOf(request, { cursor });

  expect(keysOf(page.entries)).toEqual(keysOf(ordered.slice(at + 1, at + 1 + PAGE_SIZE)));
});
