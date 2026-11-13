import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { ScriptWorld } from "./bot-script-world.ts";

const HOSTILE_EVENTS = [
  '{"taskId":"$(touch pwned)","kind":"digest","callbackToken":"tst_abc"}',
  '{"taskId":"1","kind":"digest","callbackToken":"tst_a\'b"}',
  '{"taskId":"1","kind":"digest","callbackToken":"tst_a\\nb"}',
  '{"taskId":"../../escape","kind":"digest","callbackToken":"tst_abc"}',
  '{"taskId":"1\\n2","kind":"digest","callbackToken":"tst_abc"}',
  '{"taskId":"1","kind":"digest; touch pwned","callbackToken":"tst_abc"}',
  '{"taskId":"1","kind":"`touch pwned`","callbackToken":"tst_abc"}',
  '{"taskId":1.5,"kind":"digest","callbackToken":"tst_abc"}',
  '{"taskId":true,"kind":"digest","callbackToken":"tst_abc"}',
  '{"taskId":12345678901234567,"kind":"digest","callbackToken":"tst_abc"}',
  JSON.stringify({ taskId: 1, kind: "digest", callbackToken: "x".repeat(65) }),
  '["taskId"]',
  "not json",
  "",
];

describe("the script takes a webhook event only as a file it parses itself, and no value of it becomes a shell word or a path", () => {
  let world: ScriptWorld;

  const run = async (args: readonly string[], env = world.env()) =>
    (await world.folder.run(args, env)).word;

  before(async () => {
    world = await ScriptWorld.start();
  });

  after(() => world.close());

  it("answers bad-input for an event whose fields hold shell syntax, quotes, newlines or a path, and creates nothing outside the folders of tasks", async () => {
    const words = await Promise.all(
      HOSTILE_EVENTS.map((body) => run(["task-open", world.folder.event(body)])),
    );

    assert.deepEqual(new Set(words), new Set(["bad-input"]));
    assert.deepEqual(
      world.folder.tree().filter((entry) => !entry.startsWith("tmp")),
      ["state", "tasks", "threadsift.sh"],
    );
    assert.equal(world.folder.tree().filter((entry) => entry.startsWith("tmp/event")).length, 0);
    assert.equal(existsSync(join(world.folder.path, "pwned")), false);
  });

  it("answers ping for the connection test of Threadsift and bad-input for an event file outside ~/threadsift/tmp, which stays where it is", async () => {
    const outside = mkdtempSync(join(tmpdir(), "threadsift-outside-"));
    const file = join(outside, "event.json");

    writeFileSync(file, '{"taskId":1,"kind":"digest","callbackToken":"tst_abc"}');

    try {
      assert.equal(await run(["task-open", world.folder.event('{"kind":"ping"}')]), "ping");
      assert.equal(await run(["task-open", file]), "bad-input");
      assert.equal(
        await run(["task-open", join(world.folder.path, "tmp", "..", "tasks")]),
        "bad-input",
      );
      assert.equal(existsSync(file), true);
    } finally {
      rmSync(outside, { recursive: true });
    }
  });

  it("answers bad-input for a file argument outside the task folder and ~/threadsift/tmp, or a link or query that is not one line", async () => {
    const outside = mkdtempSync(join(tmpdir(), "threadsift-outside-"));
    const file = join(outside, "link.txt");

    writeFileSync(file, "https://example.com/outside");

    try {
      assert.equal(await run(["save", file]), "bad-input");
      assert.equal(await run(["search", file]), "bad-input");
      assert.equal(await run(["task-answer", "1", file]), "bad-input");
    } finally {
      rmSync(outside, { recursive: true });
    }

    assert.equal(
      await run([
        "save",
        world.folder.tmpFile("two", "https://a.example/\nhttps://b.example/", "txt"),
      ]),
      "bad-input",
    );
    assert.equal(
      await run(["save", world.folder.tmpFile("quote", "https://example.com/it's", "txt")]),
      "ok",
    );
    assert.equal(
      await run(["save", world.folder.tmpFile("scheme", "javascript:alert(1)", "txt")]),
      "bad-input",
    );
    assert.equal(
      await run(["search", world.folder.tmpFile("two-lines", "a\nb", "txt")]),
      "bad-input",
    );
  });
});
