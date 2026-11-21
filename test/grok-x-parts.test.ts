import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ProcessEnd } from "../src/targets/node/cli-process.ts";
import { outcomeOf, versionRefusal } from "../src/targets/node/grok-answer.ts";
import { signInOf } from "../src/targets/node/grok-sign-in.ts";
import { fetchPrompt } from "../src/targets/node/grok-surface.ts";
import type { Json } from "./instance.ts";
import { POST_ID, reply, thread } from "./x-thread-fixtures.ts";

const exited = (stdout: string, code: number | null = 0): ProcessEnd => ({
  kind: "exited",
  code,
  stdout,
});

const envelope = (fields: Readonly<Record<string, Json>>) =>
  JSON.stringify({ text: "x", stopReason: "end_turn", ...fields });

const errorOf = (message: string, code: number) =>
  exited(JSON.stringify({ type: "error", message }), code);

const ENDS_OF_A_VERSION_RUN: readonly ProcessEnd[] = [
  { kind: "aborted" },
  { kind: "spawn-failed" },
  { kind: "over-cap" },
  { kind: "exited", code: 0, stdout: "" },
];

const SIGNED_OUT_MESSAGE =
  "Not signed in. To authenticate without a browser, run:\n  grok login --device-code\n\nAlternatively, set the XAI_API_KEY environment variable or run `grok login` on a machine with a browser.";

const answerOf = (thread_: ReturnType<typeof thread>) => ({
  found: true,
  thread: {
    ...thread_,
    post: { ...thread_.post, quoted: [] },
    replies: thread_.replies.map((each) => ({ ...each, replies: null })),
  },
});

const found = (value: ReturnType<typeof thread>) => envelope({ structuredOutput: answerOf(value) });

describe("the grok CLI answer is read into a fetched thread or a named refusal", () => {
  it("takes the thread of a done answer", () => {
    const outcome = outcomeOf(exited(found(thread([reply(1000000000000000011n, POST_ID)]))));
    assert.equal(outcome.kind, "fetched");
    assert.equal(outcome.kind === "fetched" && outcome.fetch.kind, "thread");
  });

  it("keeps the reply and its parent id when the parent is missing from the CLI answer", () => {
    const outcome = outcomeOf(
      exited(
        envelope({
          structuredOutput: {
            found: true,
            thread: {
              post: {
                id: "100",
                author: "alice",
                text: "Post",
                postedAt: null,
                replies: 1,
                quoted: [],
              },
              replies: [
                {
                  id: "102",
                  parentId: "101",
                  author: "bob",
                  text: "Reply",
                  postedAt: null,
                  likes: null,
                  replies: null,
                },
              ],
            },
          },
        }),
      ),
    );

    assert.ok(outcome.kind === "fetched" && outcome.fetch.kind === "thread");
    assert.deepEqual(
      outcome.fetch.thread.replies.map(({ id, parentId }) => [id, parentId]),
      [["102", "101"]],
    );
  });

  it("reads only the last JSON answer when structured output is null", () => {
    const value = thread([], { text: 'The quoted "}" is followed by {{ in the post.' });
    const outcome = outcomeOf(exited(found(value)));
    const last = JSON.stringify(answerOf(value));
    const absent = JSON.stringify({ found: false, thread: null });
    const fallback = (text: string) =>
      outcomeOf(exited(envelope({ structuredOutput: null, text })));

    assert.deepEqual(fallback([absent, absent, last].join("\n")), outcome);
    assert.deepEqual(
      fallback(last + absent),
      outcomeOf(exited(envelope({ structuredOutput: { found: false, thread: null } }))),
    );
    assert.equal(fallback(last + "{}").kind, "refused");
    assert.equal(fallback(last + " trailing").kind, "refused");
  });

  it("maps a post the tools cannot find to the status result", () => {
    const outcome = outcomeOf(
      exited(envelope({ structuredOutput: { found: false, thread: null } })),
    );

    assert.deepEqual(outcome, {
      kind: "fetched",
      fetch: { kind: "failed", status: "status" },
    });
  });

  it("refuses an answer with no structured output, one that fails the schema and one that contradicts itself as unreadable", () => {
    const missing = outcomeOf(exited(envelope({ structuredOutputError: "not JSON" })));

    const wrong = outcomeOf(
      exited(envelope({ structuredOutput: { found: true, thread: { post: {} } } })),
    );

    const contradiction = outcomeOf(
      exited(envelope({ structuredOutput: { found: true, thread: null } })),
    );

    const lingering = outcomeOf(
      exited(envelope({ structuredOutput: { found: false, thread: thread([]) } })),
    );

    assert.deepEqual(
      [missing, wrong, contradiction, lingering].map(
        (outcome) => outcome.kind === "refused" && outcome.refusal,
      ),
      [
        { status: "unreadable", category: "no-answer" },
        { status: "unreadable", category: "no-answer" },
        { status: "unreadable", category: "no-answer" },
        { status: "unreadable", category: "no-answer" },
      ],
    );
  });

  it("maps the error line of a signed-out CLI to unreadable with its exit code", () => {
    const outcome = outcomeOf(errorOf(SIGNED_OUT_MESSAGE, 1));

    assert.deepEqual(outcome, {
      kind: "refused",
      refusal: { status: "unreadable", category: "signed-out" },
      exit: 1,
    });
  });

  it("maps a non-zero exit with a done-looking envelope, and a text that is not JSON, to unreadable", () => {
    const failed = outcomeOf(exited(found(thread([])), 2));
    const garbled = outcomeOf(exited("not json at all"));

    assert.deepEqual(
      [failed, garbled].map((outcome) => outcome.kind === "refused" && outcome.refusal.category),
      ["cli-error", "cli-error"],
    );
  });

  it("maps an abort to timeout, a byte cap to unreadable and a missing binary to unreadable", () => {
    const ends: readonly ProcessEnd[] = [
      { kind: "aborted" },
      { kind: "over-cap" },
      { kind: "spawn-failed" },
    ];

    const refusals = ends.map((end) => {
      const outcome = outcomeOf(end);

      return outcome.kind === "refused" ? outcome.refusal : null;
    });

    assert.deepEqual(refusals, [
      { status: "timeout", category: "deadline" },
      { status: "unreadable", category: "over-size" },
      { status: "unreadable", category: "spawn-failed" },
    ]);
  });

  it("maps a version run that was aborted to timeout and any other failure to unreadable", () => {
    assert.deepEqual(
      ENDS_OF_A_VERSION_RUN.map((end) => versionRefusal(end).refusal),
      [
        { status: "timeout", category: "deadline" },
        { status: "unreadable", category: "spawn-failed" },
        { status: "unreadable", category: "over-size" },
        { status: "unreadable", category: "cli-error" },
      ],
    );
  });
});

describe("the sign-in line of grok models is a hint matched against the three recorded sentences", () => {
  it("reads signed in, signed out and anything else as unknown", () => {
    assert.deepEqual(
      [
        signInOf("You are logged in with grok.com.\n\nDefault model: grok-4.7\n"),
        signInOf("You are not authenticated.\n\nDefault model: grok-4.7\n"),
        signInOf("You are using XAI_API_KEY.\n"),
        signInOf("Something new.\n"),
        signInOf(""),
      ],
      ["signed-in", "signed-out", "unknown", "unknown", "unknown"],
    );
  });
});

it("preserves the requested status id in the fetch prompt and scopes every reply query to its conversation", () => {
  const id = "3200000000000000001";
  const other = "1000000000000000001";
  const prompt = fetchPrompt(id);

  assert.equal(prompt.replaceAll(id, "ID"), fetchPrompt(other).replaceAll(other, "ID"));

  const queries = prompt
    .split("\n")
    .map((line) => line.trimStart())
    .filter((line) => line.startsWith("- "));

  assert.ok(queries.length > 0);
  assert.ok(queries.every((line) => line.includes(`conversation_id:${id} filter:replies`)));
});
