import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BotAnswerSchema } from "../src/core/bot-answer.ts";
import { type BotStep, stepOf } from "../src/core/bot-task-states.ts";
import { relatedBotKind } from "../src/core/related-bot.ts";
import type { Json } from "./instance.ts";

const NOW = 1_000_000;

type Timing = NonNullable<Parameters<typeof stepOf>[0]>;

const BASE = {
  state: "running",
  sentAt: null,
  answeredAt: null,
  refusal: null,
  deadline: NOW + 1000,
} satisfies Timing;

describe("the result body is one of { result } and { error }", () => {
  const accepted = [
    { result: { picks: [] } },
    { result: null },
    { result: "text" },
    { error: "x" },
    { error: "x".repeat(200) },
  ];

  const refused = [
    {},
    [],
    null,
    "text",
    { result: 1, error: "x" },
    { error: "" },
    { error: "x".repeat(201) },
    { error: 5 },
    { answer: 1 },
    { result: 1, extra: 1 },
  ];

  it("accepts each valid shape", () => {
    assert.deepEqual(
      accepted.map((body) => BotAnswerSchema.safeParse(body).success),
      accepted.map(() => true),
    );
  });

  it("refuses everything else, a missing result included", () => {
    assert.deepEqual(
      refused.map((body) => BotAnswerSchema.safeParse(body).success),
      refused.map(() => false),
    );
  });
});

describe("the step the job takes comes from the task row and the clock", () => {
  const table: readonly (readonly [string, Timing | null, BotStep])[] = [
    ["no task", null, "start"],
    ["failed", { ...BASE, state: "failed", refusal: "unreachable" }, "start"],
    [
      "failed stale with the answer's mark still set",
      { ...BASE, state: "failed", refusal: "stale", answeredAt: 5 },
      "start",
    ],
    [
      "failed no-json with the answer's mark still set",
      { ...BASE, state: "failed", refusal: "no-json", answeredAt: 5 },
      "start",
    ],
    [
      "failed timeout with the answer's mark still set",
      { ...BASE, state: "failed", refusal: "timeout", answeredAt: 5 },
      "start",
    ],
    [
      "failed with a bot error not yet charged",
      { ...BASE, state: "failed", refusal: "provider-busy", answeredAt: 5 },
      "charge",
    ],
    [
      "failed with a bot error already charged",
      { ...BASE, state: "failed", refusal: "provider-busy" },
      "start",
    ],
    ["done", { ...BASE, state: "done" }, "start"],
    ["answered", { ...BASE, answeredAt: 5 }, "apply"],
    ["answered past the deadline", { ...BASE, answeredAt: 5, deadline: NOW - 1 }, "apply"],
    ["sent, deadline ahead", { ...BASE, sentAt: 3 }, "wait"],
    ["unsent, deadline ahead", BASE, "resend"],
    ["sent, deadline reached", { ...BASE, sentAt: 3, deadline: NOW }, "expire"],
    ["unsent, deadline passed", { ...BASE, deadline: NOW - 1 }, "expire"],
  ];

  for (const [name, task, step] of table) {
    it(`takes the ${step} step for ${name}`, () => {
      assert.equal(stepOf(task, NOW), step);
    });
  }
});

describe("the Related pick reads its own persisted context and result", () => {
  const context = JSON.stringify({
    source: { id: 1, digest: 10, storedTags: null },
    sent: [
      { id: 2, digest: 20, storedTags: null },
      { id: 3, digest: 30, storedTags: "[]" },
    ],
  });

  const parse = (result: Json) => relatedBotKind.parse(context, JSON.stringify(result)).kind;

  it("accepts picks of sent ids and refuses an id that was not sent, a duplicate and a bad shape", () => {
    assert.deepEqual(
      [
        parse({ picks: [] }),
        parse({
          picks: [
            { item: 2, reason: "Same lattice." },
            { item: 3, reason: "Same decoder." },
          ],
        }),
        parse({ picks: [{ item: 4, reason: "Not sent." }] }),
        parse({
          picks: [
            { item: 2, reason: "One." },
            { item: 2, reason: "Two." },
          ],
        }),
        parse({ picks: [{ item: 2, reason: "[bracket]" }] }),
        parse({ picks: "none" }),
        parse(null),
      ],
      ["valid", "valid", "invalid", "invalid", "invalid", "invalid", "invalid"],
    );
  });

  it("reads no context that is not its own", () => {
    assert.equal(relatedBotKind.parse("{}", "{}").kind, "invalid");
    assert.equal(relatedBotKind.describe("{}"), null);
  });

  it("describes the task with its instructions and the JSON schema of its picks", () => {
    const described = relatedBotKind.describe(context);

    assert.ok(described !== null);
    assert.deepEqual(Object.keys(described.schema.properties ?? {}), ["picks"]);
  });
});
