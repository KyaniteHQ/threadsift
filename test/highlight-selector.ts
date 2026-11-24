import assert from "node:assert/strict";

import { codePointCount } from "../src/core/contract/code-points.ts";
import { selectorAt } from "../src/core/contract/highlight-anchor.ts";

export function selectorIn(text: string, passage: string) {
  const start = text.indexOf(passage);

  assert.notEqual(start, -1, `${passage} is in the text`);

  const selector = selectorAt(text, codePointCount(text, start), codePointCount(passage));

  assert.ok(selector !== null, `${passage} is a run of whole code points`);
  assert.equal(selector.exact, passage, `the selector keeps ${passage}`);

  return { ...selector };
}
