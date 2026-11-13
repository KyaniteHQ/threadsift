import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { after, before, describe, it } from "node:test";

import { ITEM_REQUEST_BYTES } from "../src/core/limits.ts";
import { ScriptFolder } from "./bot-script-run.ts";
import { ScriptWorld } from "./bot-script-world.ts";

const HEX_WORD = /^TS_[0-9a-f]{32}$/u;
const HEX = "0123456789abcdef0123456789abcdef";

const HOSTILE = [
  "touch pwned $(touch pwned) `touch pwned` ' \" \\ \\n ; | && >",
  "EOF",
  `TS_${HEX}`,
  `'TS_${HEX}'`,
  `  TS_${HEX}  `,
  "$(id)",
  "touch pwned",
].join("\n");

const refuse = async (folder: string) => {
  const outside = mkdtempSync(join(tmpdir(), "threadsift-outside-"));
  const scratch = new ScriptFolder();

  try {
    symlinkSync(outside, join(scratch.path, folder));

    const ran = await scratch.run(["write", `x-${HEX}.txt`], {}, "text");

    return [ran.word, readdirSync(outside)];
  } finally {
    rmSync(outside, { recursive: true });
    scratch.remove();
  }
};

describe("the script makes a fresh delimiter and stores the text of a heredoc unchanged in ~/threadsift/tmp", () => {
  let world: ScriptWorld;

  const run = async (args: readonly string[], input = "") =>
    (await world.folder.run(args, world.env(), input)).word;

  const stored = (name: string) => join(world.folder.path, "tmp", name);

  const edge = async (text: string) => {
    const name = `edge-${(await run(["mark"])).slice(3)}.txt`;

    await run(["write", name], text);

    return readFileSync(stored(name), "utf8");
  };

  before(async () => {
    world = await ScriptWorld.start();
  });

  after(() => world.close());

  it("prints a new well-formed delimiter word for every mark", async () => {
    const words = await Promise.all(Array.from({ length: 20 }, () => run(["mark"])));

    assert.ok(words.every((word) => HEX_WORD.test(word)));
    assert.equal(new Set(words).size, words.length);
  });

  it("prints no delimiter and exits with an error when the random bytes cannot be read", async () => {
    const shims = mkdtempSync(join(tmpdir(), "threadsift-shims-"));

    writeFileSync(join(shims, "head"), "#!/bin/sh\nexit 1\n");
    chmodSync(join(shims, "head"), 0o755);

    try {
      const ran = await world.folder.run(["mark"], {
        PATH: `${shims}:${process.env["PATH"] ?? ""}`,
      });

      assert.equal(ran.word, "failed");
      assert.equal(ran.code, 2);
      assert.equal(HEX_WORD.test(ran.word), false);
    } finally {
      rmSync(shims, { recursive: true });
    }
  });

  it("stores text with shell syntax, quotes, backslashes and lines that look like delimiters byte for byte, and runs none of it", async () => {
    const { delimiter, ran } = await world.folder.heredoc("event-<hex>.json", HOSTILE);
    const name = `event-${delimiter.slice(3)}.json`;

    assert.equal(ran.word, "ok");
    assert.equal(readFileSync(stored(name), "utf8"), HOSTILE);
    assert.equal(existsSync(join(world.folder.path, "pwned")), false);
    assert.equal(existsSync(stored("pwned")), false);
  });

  it("answers bad-input and writes nothing for a name without the hex of a mark, a path, a name the script writes itself, and a text over the cap", async () => {
    const unchanged = world.folder.tree();

    const refused = [
      "../x.json",
      `tmp/x-${HEX}.json`,
      `/etc/x-${HEX}.json`,
      `x-${HEX}.sh`,
      `X-${HEX}.json`,
      `.x-${HEX}.json`,
      `${"a".repeat(33)}-${HEX}.json`,
      `x-${HEX}.json.txt`,
      "x.json",
      "search.json",
      "topics.json",
      `x-${HEX.toUpperCase()}.json`,
      `x-${HEX}0.json`,
      "",
    ];

    const words = await Promise.all(
      refused.map((name) => run(name === "" ? ["write"] : ["write", name], "text")),
    );

    assert.deepEqual(new Set(words), new Set(["bad-input"]));
    assert.equal(
      await run(["write", `big-${HEX}.txt`], "a".repeat(ITEM_REQUEST_BYTES + 1)),
      "bad-input",
    );
    assert.equal(await run(["write", `edge-${HEX}.txt`], "a".repeat(ITEM_REQUEST_BYTES)), "ok");
    assert.deepEqual(
      world.folder.tree().filter((entry) => !unchanged.includes(entry)),
      [`tmp/edge-${HEX}.txt`],
    );
  });

  it("drops exactly one final newline of the text, so the parts of a text join into the original bytes", async () => {
    assert.deepEqual(await Promise.all(["a", "a\n", "a\n\n", "\n", ""].map((text) => edge(text))), [
      "a",
      "a",
      "a\n",
      "",
      "",
    ]);

    const parts = [HOSTILE, "second part\n", "\nthird part", "TS_end"];
    const file = await world.folder.madeInParts("parts", parts, "txt");

    assert.equal(readFileSync(file, "utf8"), parts.join(""));
  });

  it("appends to a file that write made and answers bad-input and changes nothing for a missing file, a file of another hex and a total over the cap", async () => {
    const unchanged = world.folder.tree();

    assert.equal(await run(["append", `missing-${HEX}.txt`], "text"), "bad-input");
    assert.deepEqual(world.folder.tree(), unchanged);

    const file = await world.folder.made("big", "a".repeat(ITEM_REQUEST_BYTES - 5), "txt");
    const kept = readFileSync(file);

    assert.equal(
      await run(["append", basename(file).replace(/-.{32}\./u, `-${HEX}.`)], "x"),
      "bad-input",
    );
    assert.equal(await run(["append", basename(file)], "b".repeat(10)), "bad-input");
    assert.equal(await run(["append", "../x.txt"], "x"), "bad-input");
    assert.deepEqual(readFileSync(file), kept);
    assert.deepEqual(
      world.folder.tree().filter((entry) => entry.includes(".part") || entry.includes(".join")),
      [],
    );
    assert.equal(await run(["append", basename(file)], "b".repeat(5)), "ok");
    assert.equal(readFileSync(file).length, ITEM_REQUEST_BYTES);
  });

  it("refuses to write through a link in place of tmp, tasks or state, and writes nothing behind it", async () => {
    assert.deepEqual(await Promise.all(["tmp", "tasks", "state"].map((folder) => refuse(folder))), [
      ["bad-input", []],
      ["bad-input", []],
      ["bad-input", []],
    ]);
  });

  it("deletes the files in tmp that are more than a day old when it writes", async () => {
    mkdirSync(join(world.folder.path, "tmp"), { recursive: true });

    const old = stored("old.txt");
    const recent = stored("recent.txt");

    writeFileSync(old, "x");
    writeFileSync(recent, "x");

    const then = Date.now() / 1000 - 2 * 24 * 3600;

    utimesSync(old, then, then);

    assert.equal(await run(["write", `new-${HEX}.txt`], "text"), "ok");
    assert.equal(existsSync(old), false);
    assert.equal(existsSync(recent), true);
  });

  it("opens a task from an event file that write made through the heredoc", async () => {
    const task = await world.intake();

    const event = JSON.stringify({
      taskId: task.id,
      kind: "x_intake",
      callbackToken: task.token,
    });

    const file = await world.folder.made("event", event);

    assert.equal(await run(["task-open", file]), `ok ${String(task.id)} x_intake`);
    assert.equal(existsSync(file), false);
  });

  it("keeps the newest id of the bookmarks in state, prints none before the first one, and refuses a file that is not the cursor", async () => {
    assert.equal(await run(["bookmarks-get"]), "none");

    const cursor = (text: string) => world.folder.made("bookmarks", text);

    const refused = [
      "not json",
      "[]",
      '{"newest_id":12}',
      '{"newest_id":"12a"}',
      '{"newest_id":"1","extra":true}',
      '{"newest_id":""}',
      `{"newest_id":"${"1".repeat(31)}"}`,
    ];

    assert.deepEqual(
      await Promise.all(refused.map(async (text) => run(["bookmarks-set", await cursor(text)]))),
      refused.map(() => "bad-input"),
    );

    assert.equal(await run(["bookmarks-get"]), "none");

    const good = await cursor('{"newest_id":"1999999999999999001"}');

    assert.equal(await run(["bookmarks-set", good]), "ok");
    assert.equal(existsSync(good), false);
    assert.equal(await run(["bookmarks-get"]), "1999999999999999001");
    assert.equal(
      await run(["bookmarks-set", join(world.folder.path, "threadsift.sh")]),
      "bad-input",
    );
    assert.equal(await run(["bookmarks-get"]), "1999999999999999001");
  });
});
