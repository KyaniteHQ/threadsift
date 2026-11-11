import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { importNameOf, nextBatch, parseImportList, resumeOf } from "../src/core/import-list.ts";
import { BODY_LIMIT_BYTES } from "../src/core/limits.ts";
import { BatchRequestSchema } from "../src/http/batch-schemas.ts";

describe("the Import list parser turns literal text into the links the batch call takes", () => {
  it("reads a Reddit saved_posts.csv with relative and absolute permalinks", () => {
    const list = parseImportList(
      [
        "id,permalink",
        "abc,/r/selfhosted/comments/abc/backing_up_sqlite/",
        "def,https://www.reddit.com/r/homelab/comments/def/rack/",
        "ghi,/r/selfhosted/comments/jkl/note/mno/",
      ].join("\n"),
    );

    assert.deepEqual(list.links, [
      "https://www.reddit.com/r/selfhosted/comments/abc/backing_up_sqlite/",
      "https://www.reddit.com/r/homelab/comments/def/rack/",
      "https://www.reddit.com/r/selfhosted/comments/jkl/note/mno/",
    ]);
    assert.equal(list.skipped.noLink.count, 0);
  });

  it("reads a url column by its header without case, quoted commas, CRLF line ends and a byte order mark", () => {
    const list = parseImportList(
      '\uFEFFTitle,URL,Note\r\n"Hello, world","https://example.com/a?x=1,2","said ""hi"""\r\n"two\nlines",https://example.com/b,\r\n',
    );

    assert.deepEqual(list.links, ["https://example.com/a?x=1,2", "https://example.com/b"]);
    assert.equal(list.skipped.noLink.count, 0);
  });

  it("reads the first http or https address of each line of a list with no header", () => {
    const list = parseImportList(
      [
        "https://example.com/one",
        "",
        "  see (https://example.com/two), it is good  ",
        "ftp://example.com/three",
        "/r/selfhosted/comments/abc/x/",
        "no link here",
        "http://example.com/four",
      ].join("\r\n"),
    );

    assert.deepEqual(list.links, [
      "https://example.com/one",
      "https://example.com/two",
      "http://example.com/four",
    ]);
    assert.equal(list.skipped.noLink.count, 3);
    assert.deepEqual(list.skipped.noLink.first, [
      { row: 4, text: "ftp://example.com/three" },
      { row: 5, text: "/r/selfhosted/comments/abc/x/" },
      { row: 6, text: "no link here" },
    ]);
  });

  it("skips a CSV row with no link and counts it, and sends exact repeats once", () => {
    const list = parseImportList(
      "id,permalink\nabc,/r/a/comments/abc/x/\ndef,\nghi,not a link\nabc,/r/a/comments/abc/x/\n\n",
    );

    assert.deepEqual(list.links, ["https://www.reddit.com/r/a/comments/abc/x/"]);
    assert.equal(list.skipped.noLink.count, 2);
    assert.deepEqual(list.skipped.noLink.first, [
      { row: 3, text: "def," },
      { row: 4, text: "ghi,not a link" },
    ]);
  });

  it("keeps the first five skipped lines and counts the rest", () => {
    const list = parseImportList(Array.from({ length: 7 }, () => "words").join("\n"));

    assert.deepEqual(list.links, []);
    assert.equal(list.skipped.noLink.count, 7);
    assert.equal(list.skipped.noLink.first.length, 5);
  });

  it("keeps a long address and skips, with its own reason, only one that cannot fit in a request", () => {
    const long = `https://example.com/${"a".repeat(5000)}`;
    const huge = `https://example.com/${"a".repeat(BODY_LIMIT_BYTES)}`;
    const list = parseImportList([long, huge, "words"].join("\n"));

    assert.deepEqual(list.links, [long]);
    assert.equal(list.skipped.tooLong.count, 1);
    assert.deepEqual(list.skipped.tooLong.first, [{ row: 2, text: huge.slice(0, 120) }]);
    assert.equal(list.skipped.noLink.count, 1);
  });

  it("keeps every character of a URL that stands alone in a line or a url field", () => {
    const wiki = "https://en.wikipedia.org/wiki/SQLite_(database)";

    assert.deepEqual(parseImportList(`${wiki}\n`).links, [wiki]);
    assert.deepEqual(parseImportList(`title,url\nSQLite,${wiki}\n`).links, [wiki]);
    assert.deepEqual(parseImportList(`title,url\nSQLite,"${wiki}."\n`).links, [`${wiki}.`]);
  });

  it("reads the header from the first CSV record even when a quoted title spans lines", () => {
    const list = parseImportList(
      '"title\ncontinued",url\nhttps://wrong.example/,https://right.example/\nx,nothing\n',
    );

    assert.deepEqual(list.links, ["https://right.example/"]);
    assert.deepEqual(list.skipped.noLink.first, [{ row: 4, text: "x,nothing" }]);
    assert.equal(list.skipped.noLink.count, 1);
  });

  it("names a list by the SHA-256 of its links, so an edited list is another Import", async () => {
    const name = await importNameOf(["https://example.com/a", "https://example.com/b"]);

    assert.match(name, /^list-[\da-f]{16}$/u);
    assert.equal(name, await importNameOf(["https://example.com/a", "https://example.com/b"]));
    assert.notEqual(name, await importNameOf(["https://example.com/b", "https://example.com/a"]));
    assert.equal(await importNameOf(["a"]), "list-ca978112ca1bbdca");
  });

  it("reads a saved cursor as fresh, partial or complete against the list length", () => {
    assert.deepEqual(resumeOf(null, 250), { kind: "fresh" });
    assert.deepEqual(resumeOf("0", 250), { kind: "fresh" });
    assert.deepEqual(resumeOf("junk", 250), { kind: "fresh" });
    assert.deepEqual(resumeOf("100", 250), { kind: "partial", done: 100 });
    assert.deepEqual(resumeOf("250", 250), { kind: "complete" });
  });

  it("cuts the links into batches of at most 100 links", () => {
    const short = Array.from({ length: 250 }, (_, index) => `https://example.com/${index}`);

    assert.deepEqual(
      [0, 100, 200].map((from) => nextBatch(short, from, "list-0123456789abcdef").links.length),
      [100, 100, 50],
    );
  });

  it("cuts the links so that the serialized request, escapes and envelope included, fits the body limit", () => {
    const name = "list-0123456789abcdef";
    const escaped = `?x=${"\\".repeat(1900)}a`;

    const wide = Array.from(
      { length: 100 },
      (_, index) => `https://example.com/${index}${escaped}`,
    );

    const list = parseImportList(wide.join("\n"));

    assert.equal(list.links.length, 100);

    const sizes: number[] = [];

    for (let from = 0; from < list.links.length;) {
      const request = nextBatch(list.links, from, name);
      const bytes = new TextEncoder().encode(JSON.stringify(request)).length;
      const next = list.links[from + request.links.length];

      assert.ok(bytes <= BODY_LIMIT_BYTES);
      assert.deepEqual(BatchRequestSchema.parse(request).import, {
        name,
        cursor: String(from + request.links.length),
      });

      if (next !== undefined) {
        const longer = { links: [...request.links, { url: next }], import: request.import };

        assert.ok(new TextEncoder().encode(JSON.stringify(longer)).length > BODY_LIMIT_BYTES);
      }

      sizes.push(request.links.length);
      from += request.links.length;
    }

    assert.ok(sizes.length > 1);
    assert.equal(
      sizes.reduce((sum, size) => sum + size, 0),
      100,
    );
  });
});
