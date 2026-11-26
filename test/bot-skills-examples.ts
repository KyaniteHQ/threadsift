import assert from "node:assert/strict";

import { DigestSchema } from "../src/core/contract/digest-schema.ts";
import { IntakeAnswerSchema } from "../src/core/contract/x-intake-contract.ts";
import { XBotThreadSchema } from "../src/core/contract/x-wire.ts";
import {
  parseXThread,
  parseXThreadValue,
  readXBotThreadValue,
} from "../src/features/x/core/x-thread.ts";
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

function withoutImages(value: JsonValue): JsonValue {
  return JsonSchema.parse(
    JSON.parse(JSON.stringify(value), (name, entry: JsonValue) =>
      name === "images" ? undefined : entry,
    ),
  );
}

export function assertExamplesAccepted(): void {
  const threadJson = jsonFence("thread");
  const thread = XBotThreadSchema.parse(threadJson);
  const digest = DigestSchema.parse(jsonFence("digest"));
  const content = JSON.stringify(threadJson);
  const read = readXBotThreadValue(content);

  assert.equal(read.kind, "value");
  assert.equal(
    read.kind === "value" && parseXThreadValue(read.value, thread.post.id).kind,
    "thread",
  );
  assert.ok(thread.post.quoted.length > 1);
  assert.ok(thread.post.images.length > 0);
  assert.equal(parseXThread(content, thread.post.id).kind, "refused");
  assert.equal(
    parseXThread(JSON.stringify(withoutImages(threadJson)), thread.post.id).kind,
    "thread",
  );
  assert.deepEqual(IntakeAnswerSchema.parse({ content, digest }), { content, digest });
  assert.deepEqual(digest.keptComments, [thread.replies[0]?.id ?? ""]);
  assert.deepEqual(IntakeAnswerSchema.parse({ unavailable: true }), { unavailable: true });
}

function withStatusId(value: JsonValue, statusId: string): string {
  return JSON.stringify(value).replaceAll(`"${EXAMPLE_POST_ID}"`, `"${statusId}"`);
}

export function pasteThread(statusId: string): string {
  return withStatusId(withoutImages(jsonFence("thread")), statusId);
}

export function intakeExample(statusId: string): string {
  return JSON.stringify({
    content: withStatusId(jsonFence("thread"), statusId),
    digest: jsonFence("digest"),
  });
}
