import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { webhookBodyOf } from "../src/core/bot-task-send.ts";
import { xIntakeKind } from "../src/core/x-intake.ts";

const CONTEXT = JSON.stringify({
  itemId: 3,
  generation: 2,
  statusId: "1850000000000000001",
  url: "https://x.com/i/status/1850000000000000001",
});

const task = (context: string | null) => ({ id: 7, kind: "x_intake", context });

describe("the webhook body of an X link task carries the task id, the kind and the credential, and nothing else", () => {
  it("builds it from a stored context that it can read", () => {
    assert.equal(
      webhookBodyOf(xIntakeKind, { task: task(CONTEXT), token: "tst_abc" }),
      '{"taskId":7,"kind":"x_intake","callbackToken":"tst_abc"}',
    );
  });

  it("builds nothing from a context it cannot read", () => {
    assert.equal(webhookBodyOf(xIntakeKind, { task: task("{}"), token: "tst_abc" }), null);
    assert.equal(webhookBodyOf(xIntakeKind, { task: task(null), token: "tst_abc" }), null);
  });
});
