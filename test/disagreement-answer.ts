import assert from "node:assert/strict";

import { executeClaimed } from "../src/core/compose/jobs.ts";
import { type Sent, openJobOf, sentTask } from "./bot-kinds-fixtures.ts";
import { answered } from "./bot-task-http.ts";
import type { Instance } from "./instance.ts";

export async function sentDisagreement(instance: Instance, itemId: number): Promise<Sent> {
  const job = await openJobOf(instance, { kind: "disagreement_proposals", itemId });

  return sentTask(instance, job);
}

export async function answerDisagreement(
  instance: Instance,
  sent: Readonly<Sent>,
  disagreements: readonly Readonly<{ a: number; b: number; reason: string }>[],
): Promise<void> {
  const response = await answered(instance, sent, { result: { disagreements } });

  assert.equal(response.status, 204, response.text);
  await executeClaimed(instance.core, sent.job);
}
