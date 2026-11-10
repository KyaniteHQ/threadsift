import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isRefusedHost } from "../src/core/addresses.ts";
import { readArticle } from "../src/core/article.ts";
import { catalogKey } from "../src/core/catalog.ts";

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

  it("refuses the hosts that reach the Instance's own network and accepts public ones", () => {
    for (const host of [
      "localhost",
      "app.localhost",
      "127.0.0.1",
      "10.0.0.5",
      "192.168.1.20",
      "169.254.169.254",
      "[::1]",
    ]) {
      assert.equal(isRefusedHost(host), true, host);
    }

    for (const host of ["example.com", "8.8.8.8", "[2606:4700:4700::1111]"]) {
      assert.equal(isRefusedHost(host), false, host);
    }
  });
});
