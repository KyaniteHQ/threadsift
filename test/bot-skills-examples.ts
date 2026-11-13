import assert from "node:assert/strict";

import { DigestSchema } from "../src/core/ai-contract.ts";
import { storedCommentId } from "../src/core/comment-id.ts";
import { IntakeAnswerSchema } from "../src/core/x-intake-contract.ts";
import { parseXThread } from "../src/core/x-thread.ts";
import { XThreadSchema } from "../src/core/x-wire.ts";
import { type JsonValue, JsonSchema } from "./bot-skills-fields.ts";
import { SKILL_PATH, botFile, fencesOf } from "./bot-skills-reader.ts";

const EXAMPLE_POST_ID = "1000000000000000001";

function jsonFence(label: string): JsonValue {
  const skill = botFile(SKILL_PATH);

  const fence = fencesOf(skill.text).find(
    (found) => found.language === "json" && found.label === label,
  );

  assert.ok(fence !== undefined, `${skill.path} has no json ${label} block`);

  return JsonSchema.parse(JSON.parse(fence.body));
}

export function assertExamplesAccepted(): void {
  const threadJson = jsonFence("thread");
  const thread = XThreadSchema.parse(threadJson);
  const digest = DigestSchema.parse(jsonFence("digest"));
  const content = JSON.stringify(threadJson);

  assert.equal(parseXThread(content, thread.post.id).kind, "thread");
  assert.deepEqual(IntakeAnswerSchema.parse({ content, digest }), { content, digest });
  assert.deepEqual(digest.keptComments, [storedCommentId(thread.replies[0]?.id ?? "")]);
  assert.deepEqual(IntakeAnswerSchema.parse({ unavailable: true }), { unavailable: true });
}

export function intakeThread(statusId: string): string {
  return JSON.stringify(jsonFence("thread")).replaceAll(`"${EXAMPLE_POST_ID}"`, `"${statusId}"`);
}

export function intakeExample(statusId: string): string {
  return JSON.stringify({ content: intakeThread(statusId), digest: jsonFence("digest") });
}
