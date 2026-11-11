import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { redditJsonOfArchive } from "../src/core/archive-adapter.ts";
import { readArticle } from "../src/core/article.ts";
import { CATALOG_KEY_EXPANSION_MAX, CATALOG_KEY_MAX } from "../src/core/catalog-key-limit.ts";
import { catalogKey } from "../src/core/catalog.ts";
import { parseRedditThread } from "../src/core/reddit-json.ts";
import { overviewLine } from "../src/core/topic-overview-contract.ts";

const PARAGRAPH =
  "A tear in the middle of a page is what a plain file copy risks when a writer is busy, so the safe route is the online backup command followed by a check that the copy opens.";

const HTML = `<!doctype html>
<html lang="en">
  <head>
    <title>Backing up SQLite safely</title>
    <meta name="author" content="Ada Example">
    <meta property="article:published_time" content="2026-03-04T10:00:00Z">
  </head>
  <body>
    <nav><a href="/">Home</a><a href="/pricing">Pricing and plans</a></nav>
    <article>
      <h1>Backing up SQLite safely</h1>
      ${Array.from({ length: 5 }, () => `<p>${PARAGRAPH}</p>`).join("\n")}
    </article>
    <footer>Subscribe to our newsletter for weekly offers</footer>
  </body>
</html>`;

interface ArchiveListing {
  readonly kind: "Listing";
  readonly data: { readonly dist: number; readonly children: readonly ArchiveComment[] };
}

interface ArchiveComment {
  readonly kind: "t1";
  readonly data: {
    readonly id: string;
    readonly author: string;
    readonly body: string;
    readonly parent_id: string;
    readonly score: number;
    readonly created_utc: number;
    readonly _meta: Readonly<{ was_deleted_later?: boolean; retrieved_2nd_on?: number }>;
    readonly replies: "" | ArchiveListing;
  };
}

function archiveComment(
  id: string,
  parent: string,
  body: string,
  replies: "" | ArchiveListing,
  meta: ArchiveComment["data"]["_meta"] = {},
): ArchiveComment {
  return {
    kind: "t1",
    data: {
      id,
      author: `user_${id}`,
      body,
      parent_id: parent,
      score: 4,
      created_utc: 1_700_000_100,
      _meta: meta,
      replies,
    },
  };
}

function archiveListing(...children: readonly ArchiveComment[]): ArchiveListing {
  return { kind: "Listing", data: { dist: 0, children } };
}

describe("the parsers turn literal input into the values the library stores", () => {
  it("reads the title, author, date and body text of an article from its HTML", async () => {
    const reading = await readArticle(HTML, "https://example.com/backing-up-sqlite");

    assert.equal(reading.title, "Backing up SQLite safely");
    assert.equal(reading.author, "Ada Example");
    assert.equal(reading.postedAt, Date.parse("2026-03-04T10:00:00Z"));
    assert.ok(reading.words >= 100);
    assert.ok(reading.postText.includes(PARAGRAPH));
    assert.equal(reading.postText.includes("Pricing and plans"), false);
    assert.equal(reading.postText.includes("Subscribe to our newsletter"), false);
  });

  it("gives Topics and Tags that differ only in case, spacing or accent encoding one key", () => {
    const key = catalogKey("Machine Learning");

    assert.equal(catalogKey("  machine   LEARNING "), key);
    assert.equal(catalogKey("Café"), catalogKey("Café"));
    assert.notEqual(catalogKey("Machine Learning"), catalogKey("Machine Learnings"));
  });

  it("reads an Arctic Shift comment tree like Reddit's JSON and drops what the archive saw deleted later", () => {
    const post = {
      data: [
        {
          id: "abc123",
          title: "How do you back up SQLite?",
          author: "asker",
          subreddit: "selfhosted",
          selftext: "I copy the file nightly.",
          created_utc: 1_700_000_000,
          num_comments: 4,
        },
      ],
    };

    const tree = {
      data: [
        archiveComment(
          "c1",
          "t3_abc123",
          "Use the online backup command instead of copying the file.",
          archiveListing(
            archiveComment(
              "c2",
              "t1_c1",
              "A plain copy can tear a page while a writer is busy.",
              archiveListing(
                archiveComment("c3", "t1_c2", "It worked for me after a restart.", ""),
                archiveComment("c4", "t1_c2", "[removed]", ""),
              ),
              { was_deleted_later: true },
            ),
          ),
          { retrieved_2nd_on: 1_700_000_900 },
        ),
      ],
    };

    const json = redditJsonOfArchive(JSON.stringify(post), JSON.stringify(tree));

    assert.notEqual(json, null);

    const parsed = parseRedditThread([json ?? ""], {
      postId: "abc123",
      commentId: undefined,
      community: undefined,
    });

    assert.equal(parsed.kind, "thread");

    if (parsed.kind !== "thread") return;

    assert.equal(parsed.thread.title, "How do you back up SQLite?");
    assert.equal(parsed.thread.reported, 4);
    assert.deepEqual(
      parsed.thread.nodes.map(({ id, depth, eligible, body }) => [id, depth, eligible, body]),
      [
        ["t1_c1", 0, true, "Use the online backup command instead of copying the file."],
        ["t1_c2", 1, false, null],
        ["t1_c3", 2, true, "It worked for me after a restart."],
        ["t1_c4", 2, false, null],
      ],
    );
  });
});

describe("the overview line is the first line of an overview without its citation marks", () => {
  it("takes one line, or the first of several", () => {
    assert.equal(overviewLine("Backups need care [3]"), "Backups need care");
    assert.equal(
      overviewLine("Backups need care [3]\nCopies can tear [4][5]\nChecks help [6]"),
      "Backups need care",
    );
  });

  it("skips blank lines and reads CRLF text", () => {
    assert.equal(overviewLine("\r\n  \r\nFirst line [1]\r\nSecond [2]"), "First line");
  });

  it("removes a mark inside the line as well as at its end, because the Topic page shows no raw mark", () => {
    assert.equal(overviewLine("See [12] for the cause [13][14]"), "See for the cause");
    assert.equal(overviewLine("[12] Mid [13] mark goes"), "Mid mark goes");
  });

  it("keeps a bracketed phrase that is not an id", () => {
    assert.equal(overviewLine("Read [the docs] [12]"), "Read [the docs]");
    assert.equal(overviewLine("Read [the docs]"), "Read [the docs]");
  });

  it("returns the text unchanged when it has no mark, and null when no line is left", () => {
    assert.equal(overviewLine("No marks here"), "No marks here");
    assert.equal(overviewLine(""), null);
    assert.equal(overviewLine("\n  \n"), null);
  });
});

const LAST_SURROGATE_CODE_POINT = 0xdfff;

const FIRST_SURROGATE_CODE_POINT = 0xd800;

const LAST_CODE_POINT = 0x10ffff;

function expansionOf(codePoint: number): number {
  const character = String.fromCodePoint(codePoint);

  return (
    Math.max(catalogKey(`a${character}`).length - 1, catalogKey(character).length) /
    character.length
  );
}

function worstExpansion(): number {
  return Array.from({ length: LAST_CODE_POINT + 1 }, (_, codePoint) => codePoint)
    .filter(
      (codePoint) =>
        codePoint < FIRST_SURROGATE_CODE_POINT || codePoint > LAST_SURROGATE_CODE_POINT,
    )
    .reduce((worst, codePoint) => Math.max(worst, expansionOf(codePoint)), 0);
}

describe("the catalog key limit covers the longest key a Topic name can make", () => {
  it("is the worst expansion of one UTF-16 unit of a name, measured over every code point", () => {
    assert.equal(worstExpansion(), CATALOG_KEY_EXPANSION_MAX);
  });

  it("holds the key of a longest name made of the worst character", () => {
    assert.equal(catalogKey("\uFDFA".repeat(240)).length, CATALOG_KEY_MAX);
  });
});
