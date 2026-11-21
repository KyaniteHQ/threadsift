import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import {
  INTAKE_JOB_KINDS,
  JOB_KINDS,
  isUnownedJobKind,
} from "../src/core/contract/job-contract.ts";
import { readWorld } from "./ai-task-read-http.ts";
import { KIND_CASES } from "./bot-kinds-cases.ts";
import { botInstance, openJobOf, sentTask } from "./bot-kinds-fixtures.ts";
import { WEBHOOK_FIELDS, readTask, schemaFields } from "./bot-skills-fields.ts";
import { SKILL_PATH, botFile, proseOf, sectionOf, spansOf } from "./bot-skills-reader.ts";
import { taskAfterStart } from "./bot-task-lifecycle.ts";
import { sentIntake } from "./x-intake-fixtures.ts";

const CAMEL = /^[a-z]+(?:[A-Z][a-z]+)+$/u;

const KIND = /^[a-z]+(?:_[a-z]+)*$/u;

describe("the skill names the task kinds, the task fields and the answer fields that the server has", () => {
  const skill = botFile(SKILL_PATH);
  const webhook = sectionOf(skill.text, "Webhook task");

  let intake: Awaited<ReturnType<typeof readTask>>;
  let world: Awaited<ReturnType<typeof readWorld>>;

  before(async () => {
    world = await readWorld();
    const task = await sentIntake(world.instance);
    intake = await readTask(world.instance, task);
  });
  after(() => world.instance.close());

  it("lists the task kinds of the server, and no other", async () => {
    const [, steps = ""] = webhook.split("4. By `kind`:");

    const kinds = steps
      .split("\n")
      .filter((line) => /^ {3}- `/u.test(line))
      .flatMap((line) => spansOf(line.split(":")[0] ?? "").filter((span) => KIND.test(span)));

    const relatedTask = await taskAfterStart(world.instance, world.library.source);
    const related = await readTask(world.instance, relatedTask);
    const modelJobs = JOB_KINDS.filter(
      (kind) =>
        !isUnownedJobKind(kind) &&
        kind !== related.kind &&
        !INTAKE_JOB_KINDS.some((intakeKind) => intakeKind === kind),
    );
    const served = await Promise.all(
      modelJobs.map(async (kind) => {
        const kindCase = KIND_CASES.find((entry) => entry.kind === kind);
        assert.ok(kindCase, kind);
        const instance = await botInstance();
        try {
          const owner = await kindCase.library(instance);
          const job = await openJobOf(instance, { kind: kindCase.kind, itemId: owner });
          const task = await sentTask(instance, job);
          const read = await readTask(instance, task);
          return read.kind;
        } finally {
          await instance.close();
        }
      }),
    );
    assert.deepEqual(kinds.toSorted(), [...served, related.kind, intake.kind].toSorted());
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
    assert.ok(spansOf(webhook).includes(`{${WEBHOOK_FIELDS.join(", ")}}`));

    for (const span of spansOf(proseOf(skill.text)).filter((found) => found.startsWith("{"))) {
      for (const [, key = ""] of span.matchAll(/"(\w+)":/gu)) assert.ok(fields.has(key), key);
    }

    for (const span of spansOf(proseOf(skill.text)).filter((found) => CAMEL.test(found))) {
      assert.ok(fields.has(span), span);
    }
  });
});
