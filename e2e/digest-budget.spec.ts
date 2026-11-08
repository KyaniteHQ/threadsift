import { expect, test } from "@playwright/test";
import { z } from "zod";

import { TASKS } from "../src/core/ai-tasks.ts";
import { type CommentCandidate, digestPrompt } from "../src/core/digest-prompt.ts";

const CAP_BYTES = 14_000;

const NO_NAMES = { topics: [], tags: [] };

const Prompt = z.object({
  title: z.string().nullable(),
  source: z.string(),
  postText: z.string().nullable(),
  comments: z.array(
    z.object({ id: z.string(), parentId: z.string().nullable(), body: z.string() }),
  ),
});

function candidate(index: number, body: string): CommentCandidate {
  return { id: `t1_c${index}`, parentId: index === 0 ? null : `t1_c${index - 1}`, body };
}

function candidates(...bodies: readonly string[]): CommentCandidate[] {
  return bodies.map((body, index) => candidate(index, body));
}

function ready(
  postText: string | null,
  comments: readonly CommentCandidate[],
  title: string | null = "A thread",
) {
  const prompt = digestPrompt({ title, source: "reddit", postText }, comments, NO_NAMES);

  if (prompt.kind !== "ready") throw new Error("the fixed metadata alone is over the cap");

  const [lists = "", item = ""] = prompt.input.split("\n");
  const bytes = Buffer.byteLength(prompt.input);

  expect(lists, "the catalog line is whole JSON").toBe('{"topics":[],"tags":[]}');
  expect(bytes, "the whole input is within the cap").toBeLessThanOrEqual(CAP_BYTES);
  expect(TASKS.digest.prepareInput(prompt.input), "task preparation leaves it unchanged").toBe(
    prompt.input,
  );

  const parsed = Prompt.parse(JSON.parse(item));

  expect(parsed.comments.map(({ id }) => id)).toEqual(prompt.submitted);
  expect(prompt.counts).toEqual({
    eligible: comments.length,
    submitted: prompt.submitted.length,
    omitted: comments.length - prompt.submitted.length,
  });

  for (const sent of parsed.comments) {
    expect(sent.body, "a comment is sent whole or not at all").toBe(
      comments.find(({ id }) => id === sent.id)?.body,
    );
  }

  return { prompt, parsed, bytes };
}

const TEXTS = {
  quotes: '"quoted" he said, "again" and \'once more\' ',
  backslashes: "C:\\temp\\new\\table \\\\ \\u0041 ",
  breaks: "first line\nsecond line\r\nthird\u2028fourth\u2029fifth\ttabbed\u0001 ",
  multibyte: "Kaynağı önce kontrol edin 出典を確認する 📖🧪 ",
};

for (const [name, unit] of Object.entries(TEXTS)) {
  test(`${name} in the post text and in the comments reach the Provider as whole JSON within 14,000 bytes`, () => {
    const comments = candidates(
      ...Array.from({ length: 80 }, (_, index) => unit.repeat(3 + (index % 5))),
    );

    const { parsed, bytes } = ready(unit.repeat(2000), comments);

    expect(unit.repeat(2000).startsWith(parsed.postText ?? "x")).toBe(true);
    expect(parsed.postText, "the cut is at a whole character").toBe(
      parsed.postText?.toWellFormed(),
    );
    expect(parsed.comments.length).toBeGreaterThan(0);
    expect(bytes).toBeGreaterThan(CAP_BYTES - 8);
  });
}

test("an oversized comment is skipped whole and the smaller ones after it are sent in position order", () => {
  const comments = candidates(
    "first",
    "x".repeat(20_000),
    "third",
    "fourth",
    "y".repeat(14_000),
    "sixth",
  );

  const { prompt } = ready("The post.", comments);

  expect(prompt.submitted).toEqual(["t1_c0", "t1_c2", "t1_c3", "t1_c5"]);
});

test("a skipped comment comes back in position order when the post text leaves room", () => {
  const comments = candidates("a".repeat(5000), "b".repeat(4000), "c".repeat(500));
  const { prompt, parsed } = ready("short post", comments);

  expect(prompt.submitted).toEqual(["t1_c0", "t1_c1", "t1_c2"]);
  expect(parsed.postText).toBe("short post");
});

test("a long post text takes the room that the comment half leaves", () => {
  const comments = candidates("a".repeat(3000), "b".repeat(3000), "c".repeat(3000));
  const { prompt, parsed, bytes } = ready("z".repeat(50_000), comments);

  expect(prompt.submitted).toEqual(["t1_c0", "t1_c1"]);
  expect(parsed.postText?.length).toBeGreaterThan(6500);
  expect(bytes).toBe(CAP_BYTES);
});

test("comments take more than half when the post text is short", () => {
  const comments = candidates(
    ...Array.from({ length: 40 }, (_, index) => `${index} ${"w".repeat(380)}`),
  );

  const { parsed, bytes } = ready("Short.", comments);

  expect(parsed.postText).toBe("Short.");
  expect(parsed.comments.length).toBeGreaterThan(30);
  expect(bytes).toBeGreaterThan(CAP_BYTES - 450);
});

test("an empty post text stays empty, a missing one stays null, and both leave the room to the comments", () => {
  const comments = candidates(
    ...Array.from({ length: 60 }, (_, index) => `${index} ${"v".repeat(400)}`),
  );

  const empty = ready("", comments);
  const missing = ready(null, comments);

  expect(empty.parsed.postText).toBe("");
  expect(missing.parsed.postText).toBeNull();
  expect(empty.parsed.comments.length).toBeGreaterThan(25);
  expect(missing.parsed.comments.length).toBeGreaterThan(25);
});

test("a thread without candidates sends an empty comment list", () => {
  expect(ready("Only the post.", []).parsed.comments).toEqual([]);
});

test("metadata that alone passes the cap is refused before any comment is read", () => {
  const prompt = digestPrompt(
    { title: "\u0001".repeat(3000), source: "reddit", postText: null },
    candidates("a comment"),
    NO_NAMES,
  );

  expect(prompt.kind).toBe("too-large");
  expect(prompt.kind === "too-large" ? prompt.fixedBytes : 0).toBeGreaterThan(CAP_BYTES);
});
