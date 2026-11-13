import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TaskReadSchema, WebhookBodySchema } from "../src/core/ai-task-read.ts";
import { BOT_TASK_KINDS } from "../src/core/bot-task-kinds.ts";
import { X_INTAKE_TASK } from "../src/core/x-intake-contract.ts";
import { schemaFields } from "./bot-skills-fields.ts";
import { SKILL_PATH, botFile, proseOf, sectionOf, spansOf } from "./bot-skills-reader.ts";

const CAMEL = /^[a-z]+(?:[A-Z][a-z]+)+$/u;

const KIND = /^[a-z]+(?:_[a-z]+)*$/u;

describe("the skill names the task kinds, the task fields and the answer fields that the server has", () => {
  const skill = botFile(SKILL_PATH);
  const webhook = sectionOf(skill.text, "Webhook task");

  it("lists the task kinds of the server, and no other", () => {
    const [, steps = ""] = webhook.split("4. By `kind`:");

    const kinds = steps
      .split("\n")
      .filter((line) => /^ {3}- `/u.test(line))
      .flatMap((line) => spansOf(line.split(":")[0] ?? "").filter((span) => KIND.test(span)));

    assert.deepEqual(kinds.toSorted(), [...Object.keys(BOT_TASK_KINDS), X_INTAKE_TASK].toSorted());
  });

  it("names the fields of a task read, the fields of a webhook body and only fields that an answer schema has", () => {
    const read = webhook.split("\n").find((line) => line.startsWith("3. "));
    const fields = new Set(schemaFields());

    assert.deepEqual(
      spansOf(read ?? "").filter((span) => /^[a-z]+$/iu.test(span)),
      Object.keys(TaskReadSchema.shape),
    );
    assert.ok(spansOf(webhook).includes(`{${Object.keys(WebhookBodySchema.shape).join(", ")}}`));

    for (const span of spansOf(proseOf(skill.text)).filter((found) => found.startsWith("{"))) {
      for (const [, key = ""] of span.matchAll(/"(\w+)":/gu)) assert.ok(fields.has(key), key);
    }

    for (const span of spansOf(proseOf(skill.text)).filter((found) => CAMEL.test(found))) {
      assert.ok(fields.has(span), span);
    }
  });
});
