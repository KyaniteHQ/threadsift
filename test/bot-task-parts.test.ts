import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { type BotStep, stepOf } from "../src/core/kernel/ai-task-state.ts";

const NOW = 1_000_000;

type Timing = NonNullable<Parameters<typeof stepOf>[0]>;

const BASE = {
  state: "running",
  sentAt: null,
  answeredAt: null,
  refusal: null,
  deadline: NOW + 1000,
} satisfies Timing;

describe("the step the job takes comes from the task row and the clock", () => {
  const table: readonly (readonly [string, Timing | null, BotStep])[] = [
    ["no task", null, "start"],
    ["done", { ...BASE, state: "done" }, "start"],
    ["answered past the deadline", { ...BASE, answeredAt: 5, deadline: NOW - 1 }, "apply"],
    ["sent, deadline ahead", { ...BASE, sentAt: 3 }, "wait"],
    ["sent, deadline reached", { ...BASE, sentAt: 3, deadline: NOW }, "expire"],
    ["unsent, deadline passed", { ...BASE, deadline: NOW - 1 }, "expire"],
  ];

  for (const [name, task, step] of table) {
    it(`takes the ${step} step for ${name}`, () => {
      assert.equal(stepOf(task, NOW), step);
    });
  }
});
