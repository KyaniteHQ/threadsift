import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import {
  INTAKE_JOB_KINDS,
  JOB_KINDS,
  isUnownedJobKind,
} from "../src/core/contract/job-contract.ts";
import { readTask, readWorld } from "./ai-task-read-http.ts";
import { WEBHOOK_FIELDS, schemaFields } from "./bot-skills-fields.ts";
import { SKILL_PATH, botFile, proseOf, sectionOf, spansOf } from "./bot-skills-reader.ts";
import { sentIntake } from "./x-intake-fixtures.ts";

const CAMEL = /^[a-z]+(?:[A-Z][a-z]+)+$/u;

const KIND = /^[a-z]+(?:_[a-z]+)*$/u;

describe("the skill names the task kinds, the task fields and the answer fields that the server has", () => {
  const skill = botFile(SKILL_PATH);
  const webhook = sectionOf(skill.text, "Webhook task");

  let intake: Awaited<ReturnType<typeof readTask>>["read"];
  let world: Awaited<ReturnType<typeof readWorld>>;

  before(async () => {
    world = await readWorld();
    const task = await sentIntake(world.instance);
    ({ read: intake } = await readTask(world.instance, task));
  });
  after(() => world.instance.close());

  it("lists the task kinds of the server, and no other", () => {
    const [, steps = ""] = webhook.split("4. By `kind`:");

    const kinds = steps
      .split("\n")
      .filter((line) => /^ {3}- `/u.test(line))
      .flatMap((line) => spansOf(line.split(":")[0] ?? "").filter((span) => KIND.test(span)));

    const modelJobs = JOB_KINDS.filter(
      (kind) =>
        !isUnownedJobKind(kind) && !INTAKE_JOB_KINDS.some((intakeKind) => intakeKind === kind),
    );
    assert.deepEqual(kinds.toSorted(), [...modelJobs, intake.kind].toSorted());
  });

  it("names the fields of a task read, the fields of a webhook body and only fields that an answer schema has", () => {
    const read = webhook.split("\n").find((line) => line.startsWith("3. "));
    const fields = new Set(schemaFields(intake.input));

    assert.deepEqual(
      spansOf(read ?? "")
        .filter((span) => /^[a-z]+$/iu.test(span))
        .toSorted(),
      Object.keys(intake).toSorted(),
    );
    const body = spansOf(webhook).find((span) => span.startsWith("{") && span.endsWith("}"));
    assert.ok(body !== undefined);
    assert.deepEqual(
      body
        .slice(1, -1)
        .split(",")
        .map((name) => name.trim())
        .toSorted(),
      WEBHOOK_FIELDS.toSorted(),
    );

    for (const span of spansOf(proseOf(skill.text)).filter((found) => found.startsWith("{"))) {
      for (const [, key = ""] of span.matchAll(/"(\w+)":/gu)) assert.ok(fields.has(key), key);
    }

    for (const span of spansOf(proseOf(skill.text)).filter((found) => CAMEL.test(found))) {
      assert.ok(fields.has(span), span);
    }
  });
});
