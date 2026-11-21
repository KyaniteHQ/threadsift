import assert from "node:assert/strict";
import { test } from "node:test";

test("proof: a failing core test reaches the artifact", () => {
  assert.equal(1, 2);
});
