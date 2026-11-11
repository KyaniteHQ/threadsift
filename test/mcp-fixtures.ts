import assert from "node:assert/strict";

import { HighlightResponseSchema } from "../src/core/highlight-contract.ts";
import { NoteResponseSchema } from "../src/core/note-contract.ts";
import { SavedItemResponseSchema } from "../src/http/schemas.ts";
import type { Instance, Json } from "./instance.ts";

export const KEPT_ARTICLE = "https://example.com/guides/kept-highlight";

export const LOST_ARTICLE = "https://example.com/guides/lost-highlight";

export const NOTE_WORD = "marmotnote";

export const NOTE_BODY = `Try this at home, ${NOTE_WORD}`;

export const DIGEST = {
  title: "Backing up SQLite safely",
  topic: "Databases",
  tags: ["sqlite", "backups"],
  summary:
    "Use the online backup command, not a file copy.\nCheck the copy opens before trusting it.",
  keyPoints: ["A file copy can tear a page", "The backup command is safe while writers run"],
};

export const FILLER_COUNT = 52;

const THREAD_LINK = "https://www.reddit.com/r/selfhosted/comments/abc123/x/";

const SENTENCE =
  "Copying the database file while the writer is busy can tear a page, so take the copy with the online backup command instead and check it opens cleanly before trusting it.";

const BODY = Array.from({ length: 6 }, () => SENTENCE).join("\n\n");

const QUOTE = "online backup command";

const COMMENT_TEXT = "Use sqlite3 .backup, a plain copy can tear a page while a writer is busy.";

const COMMENT_QUOTE = "plain copy can tear a page";

const CONTEXT = 32;

function comment(id: string, parent: string, body: string, replies: Json): Json {
  return {
    kind: "t1",
    data: {
      id,
      author: "someone",
      body,
      parent_id: parent,
      score: 3,
      created_utc: 1_700_000_100,
      replies,
    },
  };
}

const THREAD: Json = [
  {
    kind: "Listing",
    data: {
      children: [
        {
          kind: "t3",
          data: {
            id: "abc123",
            title: "How do you back up SQLite?",
            author: "asker",
            subreddit: "selfhosted",
            selftext: "I copy the file nightly and wonder if that is safe.",
            created_utc: 1_700_000_000,
            num_comments: 2,
          },
        },
      ],
    },
  },
  {
    kind: "Listing",
    data: {
      children: [
        comment(
          "c1",
          "t3_abc123",
          "Use sqlite3 .backup rather than a plain copy while a writer is busy.",
          {
            kind: "Listing",
            data: { children: [comment("c2", "t1_c1", COMMENT_TEXT, "")] },
          },
        ),
      ],
    },
  },
];

export interface Library {
  readonly keptId: number;
  readonly lostId: number;
  readonly threadId: number;
  readonly fillerIds: readonly number[];
}

function page(text: string): Json {
  return { markdown: `${BODY}\n\n${text}`, title: "Backing up SQLite", author: "Ada Example" };
}

function selectorFor(text: string, exact: string): Json {
  const start = text.indexOf(exact);

  assert.notEqual(start, -1);

  return {
    exact,
    prefix: text.slice(Math.max(0, start - CONTEXT), start),
    suffix: text.slice(start + exact.length, start + exact.length + CONTEXT),
    hint: start,
  };
}

async function paste(instance: Instance, url: string, supplied: Record<string, Json> = {}) {
  const { item } = await instance.read("POST", "/api/items", SavedItemResponseSchema, {
    url,
    ...supplied,
  });

  await instance.settledItem(item.id);

  return item.id;
}

async function highlight(
  instance: Instance,
  id: number,
  target: Json,
  revision: number,
  selector: Json,
) {
  const { highlight: saved } = await instance.read(
    "POST",
    `/api/items/${String(id)}/highlights`,
    HighlightResponseSchema,
    { target, revision, selector },
  );

  return saved;
}

export async function seedLibrary(instance: Instance): Promise<Library> {
  const keptId = await paste(instance, KEPT_ARTICLE, {
    page: page("The kept note holds."),
    digest: DIGEST,
  });

  const kept = await instance.detail(keptId);

  await highlight(
    instance,
    keptId,
    { kind: "post" },
    kept.highlights.revisions.post,
    selectorFor(kept.postText ?? "", QUOTE),
  );
  await instance.read("PUT", `/api/items/${String(keptId)}/note`, NoteResponseSchema, {
    body: NOTE_BODY,
    revision: kept.note.revision,
  });

  const lostId = await paste(instance, LOST_ARTICLE, {
    page: page("The first text."),
    digest: DIGEST,
  });

  const lost = await instance.detail(lostId);

  await highlight(
    instance,
    lostId,
    { kind: "post" },
    lost.highlights.revisions.post,
    selectorFor(lost.postText ?? "", QUOTE),
  );
  await paste(instance, LOST_ARTICLE, {
    page: {
      markdown: "A rewritten text with none of the quoted words.\n\n".repeat(30),
      title: "Rewritten",
    },
  });

  const threadId = await paste(instance, THREAD_LINK, {
    content: JSON.stringify(THREAD),
    digest: { ...DIGEST, keptComments: ["t1_c2"] },
  });

  const thread = await instance.detail(threadId);

  await highlight(
    instance,
    threadId,
    { kind: "comment", commentId: "t1_c2" },
    thread.highlights.revisions.comments ?? 0,
    selectorFor(COMMENT_TEXT, COMMENT_QUOTE),
  );
  await paste(instance, THREAD_LINK, {
    content: JSON.stringify(THREAD),
    digest: { ...DIGEST, keptComments: ["t1_c1"] },
  });

  const fillerIds = await Promise.all(
    Array.from({ length: FILLER_COUNT }, (_, at) =>
      paste(instance, `https://x.com/someone/status/${String(1_000_000 + at)}`),
    ),
  );

  return { keptId, lostId, threadId, fillerIds };
}
