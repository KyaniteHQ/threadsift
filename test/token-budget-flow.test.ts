import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BUDGET_START,
  type BudgetFlow,
  parseBudget,
  reduceBudget,
  rowBudget,
} from "../web/src/token-budget.ts";

const saving = (id: number, request: number): BudgetFlow => ({ kind: "saving", id, request });

describe("the budget form on a token row keeps the answer of the save that is current", () => {
  it("ignores the answer of an older save and takes the answer of the current one", () => {
    const current = saving(3, 2);

    assert.equal(reduceBudget(current, { kind: "saved", id: 3, request: 1 }), current);
    assert.equal(reduceBudget(current, { kind: "refuse", id: 3, request: 1 }), current);
    assert.deepEqual(reduceBudget(current, { kind: "saved", id: 3, request: 2 }), {
      kind: "idle",
      focus: 3,
    });
    assert.deepEqual(reduceBudget(current, { kind: "refuse", id: 3, request: 2 }), {
      kind: "failed",
      id: 3,
    });
  });

  it("keeps the save in flight when the owner presses Cancel or opens another row", () => {
    const current = saving(3, 2);

    assert.equal(reduceBudget(current, { kind: "cancel", id: 3 }), current);
    assert.equal(reduceBudget(current, { kind: "edit", id: 4 }), current);
    assert.equal(rowBudget(current, 3), "saving");
    assert.equal(rowBudget(current, 4), "idle");
    assert.equal(rowBudget(BUDGET_START, 3), "idle");
  });
});

describe("the budget field takes the numbers the server takes", () => {
  it("accepts a whole number above 0 of any size the server accepts, and an empty field as no budget", () => {
    assert.deepEqual(parseBudget("200"), { kind: "limit", limit: 200 });
    assert.deepEqual(parseBudget(" 1000000000000000 "), {
      kind: "limit",
      limit: 1_000_000_000_000_000,
    });
    assert.deepEqual(parseBudget("  "), { kind: "none" });
  });

  it("refuses 0, a sign, a fraction, an exponent and a number too large to count", () => {
    for (const text of ["0", "-5", "1.5", "1e3", "ten", "99999999999999999999"]) {
      assert.deepEqual(parseBudget(text), { kind: "invalid" }, text);
    }
  });
});
