import type { APIRequestContext } from "@playwright/test";

import { projectText } from "../src/core/text-projection.ts";
import { itemOf } from "./api.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { POST, created, postRevision, putPost, selectorOf } from "./highlights.ts";
import { saved } from "./notes.ts";
import { seedRows } from "./reader.ts";
import { idAt } from "./search.ts";
import { marker, post, postUrl, run } from "./thread-fixtures.ts";
import { savedThread, threadJson } from "./threads.ts";

export const FIRST_DATE = 1_700_000_000_000;

export interface Digested {
  readonly title: string;
  readonly topic: string;
  readonly tag: string;
}

export async function seedPost(
  { context }: Readonly<Pick<FreshScreen, "context">>,
  tag: string,
  text: string,
  digest: Readonly<Digested>,
): Promise<number> {
  const id = `${tag}${run}`;

  const { item } = await savedThread(context.request, {
    url: postUrl(id),
    content: threadJson(post(id, text), []),
    digest: {
      title: digest.title,
      topic: digest.topic,
      tags: [digest.tag],
      summary: "A thread to keep passages from.",
      keyPoints: ["Kept."],
      keptComments: [],
    },
  });

  return item.id;
}

function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function seedArticle(
  screen: FreshScreen,
  tag: string,
  fields: Readonly<{ title: string; text: string; topic: string; tag: string }>,
): number {
  const url = `https://example.com/${tag}${run}`;
  const key = (name: string): string => sqlText(name.toLowerCase());

  seedRows(screen, [{ url, title: fields.title, postText: fields.text }]);
  const id = idAt(screen, url);

  screen.fresh.sql(
    [
      `INSERT OR IGNORE INTO topics (key, name) VALUES (${key(fields.topic)}, ${sqlText(fields.topic)})`,
      `UPDATE items SET topic_id = (SELECT id FROM topics WHERE key = ${key(fields.topic)}) WHERE id = ${id}`,
      `INSERT OR IGNORE INTO tags (key, name) VALUES (${key(fields.tag)}, ${sqlText(fields.tag)})`,
      `INSERT INTO item_tags (item_id, tag_id) VALUES (${id}, (SELECT id FROM tags WHERE key = ${key(fields.tag)}))`,
    ].join("; "),
  );

  return id;
}

export async function keepQuote(
  { context }: Readonly<Pick<FreshScreen, "context">>,
  itemId: number,
  text: string,
  quote: string,
): Promise<number> {
  const { request } = context;

  const highlight = await created(request, itemId, {
    target: POST,
    revision: await postRevision(request, itemId),
    selector: selectorOf(projectText(text), quote),
  });

  return highlight.id;
}

export function wordAt(index: number): string {
  return `quote${String(index).padStart(3, "0")}x`;
}

export async function keepWords(
  screen: FreshScreen,
  tag: string,
  count: number,
  onKept?: (id: number, index: number) => void,
): Promise<number> {
  const { request } = screen.context;
  const text = Array.from({ length: count }, (_, index) => wordAt(index)).join(" ");
  const itemId = await putPost(request, `${tag}${run}`, text);
  const revision = await postRevision(request, itemId);
  const projection = projectText(text);

  for (let index = 0; index < count; index += 1) {
    const { id } = await created(request, itemId, {
      target: POST,
      revision,
      selector: selectorOf(projection, wordAt(index)),
    });

    onKept?.(id, index);
  }

  return itemId;
}

export function dateHighlight(screen: FreshScreen, id: number, date: number): void {
  screen.fresh.sql(`UPDATE highlights SET created_at = ${date} WHERE id = ${id}`);
}

export function dateNote(screen: FreshScreen, itemId: number, date: number): void {
  screen.fresh.sql(`UPDATE notes SET updated_at = ${date} WHERE item_id = ${itemId}`);
}

export async function keepNote(
  screen: FreshScreen,
  itemId: number,
  body: string,
  date: number,
): Promise<void> {
  await saved(screen.context.request, itemId, body, 0);
  dateNote(screen, itemId, date);
}

export const WORDS = {
  desk: marker("walnut"),
  shelf: marker("oak"),
  draft: marker("drafts"),
  pass: marker("pass"),
  margin: marker("margin"),
  wide: marker("wide"),
};

export interface Library {
  readonly reddit: number;
  readonly writing: number;
  readonly article: number;
  readonly entries: readonly {
    readonly kind: "highlight" | "note";
    readonly id: number;
    readonly text: string;
    readonly itemId: number;
    readonly date: number;
  }[];
}

const DESK_TEXT = `Reading about the ${WORDS.desk} desk helps a lot. Another sentence about the tablet.`;

const WRITING_TEXT = `The first draft is slow. Writing ${WORDS.draft} slowly and a ${WORDS.pass} second pass makes it better.`;

const ARTICLE_TEXT = `A plain article with ${WORDS.margin} notes and wide margins.`;

async function seedItems(screen: FreshScreen) {
  const reddit = await seedPost(screen, "pa", DESK_TEXT, {
    title: "Notebook cache guide",
    topic: "Reading",
    tag: "Notebooks",
  });

  const writing = await seedPost(screen, "pb", WRITING_TEXT, {
    title: "Essay craft",
    topic: "Writing",
    tag: "Craft",
  });

  const article = seedArticle(screen, "pc", {
    title: "Plain article",
    text: ARTICLE_TEXT,
    topic: "Reading",
    tag: "Craft",
  });

  return { reddit, writing, article };
}

export async function buildLibrary(screen: FreshScreen): Promise<Library> {
  const { reddit, writing, article } = await seedItems(screen);

  const entries = [
    { kind: "highlight", itemId: reddit, quote: `${WORDS.desk} desk`, text: DESK_TEXT, at: 1 },
    { kind: "highlight", itemId: writing, quote: WORDS.draft, text: WRITING_TEXT, at: 2 },
    {
      kind: "highlight",
      itemId: article,
      quote: `${WORDS.margin} notes`,
      text: ARTICLE_TEXT,
      at: 3,
    },
    { kind: "note", itemId: reddit, quote: `Compare the ${WORDS.shelf} shelf first`, at: 4 },
    { kind: "highlight", itemId: writing, quote: WORDS.pass, text: WRITING_TEXT, at: 5 },
    { kind: "note", itemId: article, quote: `${WORDS.wide} margins read better`, at: 6 },
  ] as const;

  const made: Library["entries"][number][] = [];

  for (const entry of entries) {
    const date = FIRST_DATE + entry.at * 1000;

    if (entry.kind === "highlight") {
      const id = await keepQuote(screen, entry.itemId, entry.text, entry.quote);
      dateHighlight(screen, id, date);
      made.push({ kind: "highlight", id, text: entry.quote, itemId: entry.itemId, date });
    } else {
      await keepNote(screen, entry.itemId, entry.quote, date);
      made.push({ kind: "note", id: entry.itemId, text: entry.quote, itemId: entry.itemId, date });
    }
  }

  return { reddit, writing, article, entries: made };
}

export async function itemFacts(request: APIRequestContext, id: number) {
  const { source, savedAt, title, digestTitle } = await itemOf(request, id);

  return { id, source, title: digestTitle ?? title, savedAt };
}
