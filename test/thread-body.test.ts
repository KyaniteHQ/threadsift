import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fitThreadBody } from "../extension/lib/thread-body.ts";

const LINK = "https://www.reddit.com/r/sqlite/comments/abc123/online_backups/";

const MEBIBYTE = 1024 * 1024;

const LIMIT = 8 * MEBIBYTE;

const bytesOf = (text: string): number => new Blob([text]).size;

const exactlyFull = () =>
  "x".repeat(LIMIT - bytesOf(JSON.stringify({ url: LINK, content: ["thread", ""] })));

describe("the Extension sends a thread body of at most 8 MiB and drops trailing answers to get there", () => {
  it("sends every answer, with fill only when the Fill setting asked for it", () => {
    const answers = ["thread", "first answer", "second answer"] as const;

    assert.deepEqual(fitThreadBody(LINK, answers, false), { url: LINK, content: answers });
    assert.deepEqual(fitThreadBody(LINK, answers, true), {
      url: LINK,
      content: answers,
      fill: true,
    });
  });

  it("drops trailing answers until the body fits, and keeps the answers that stay in their order", () => {
    const answers = [
      "a".repeat(3 * MEBIBYTE),
      "b".repeat(3 * MEBIBYTE),
      "c".repeat(3 * MEBIBYTE),
    ] as const;
    const kept = fitThreadBody(LINK, ["thread", ...answers], false);

    assert.deepEqual(kept?.content, ["thread", answers[0], answers[1]]);
  });

  it("counts the UTF-8 bytes of the body, so characters that take 3 bytes count 3", () => {
    const euros = "€".repeat(MEBIBYTE);
    const kept = fitThreadBody(LINK, ["thread", euros, euros, euros], false);

    assert.equal(kept?.content.length, 3);
  });

  it("counts the body as JSON, so a newline that JSON writes as two characters counts 2", () => {
    const lines = "\n".repeat(3 * MEBIBYTE);
    const kept = fitThreadBody(LINK, ["thread", lines, lines], false);

    assert.equal(kept?.content.length, 2);
  });

  it("keeps a body of exactly 8 MiB and drops the last answer of a body one byte over", () => {
    const filler = exactlyFull();

    assert.equal(fitThreadBody(LINK, ["thread", filler], false)?.content.length, 2);
    assert.deepEqual(fitThreadBody(LINK, ["thread", `${filler}x`], false)?.content, ["thread"]);
  });

  it("keeps the answers that fit once a trailing answer and its comma are gone", () => {
    const filler = exactlyFull();

    assert.deepEqual(fitThreadBody(LINK, ["thread", filler, "b"], false)?.content, [
      "thread",
      filler,
    ]);
  });

  it("answers null when the first answer alone does not fit, so the caller saves the page instead", () => {
    const tooBig = "x".repeat(LIMIT + 1);

    assert.equal(fitThreadBody(LINK, [tooBig], false), null);
    assert.equal(fitThreadBody(LINK, [tooBig, "a reply"], false), null);
  });
});
