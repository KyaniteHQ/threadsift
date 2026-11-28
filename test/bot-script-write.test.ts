import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { ITEM_REQUEST_BYTES } from "../src/core/contract/limits.ts";
import { ScriptFolder } from "./bot-script-run.ts";
import { DAY, ScriptWorld, ageBy, justBefore, justPast } from "./bot-script-world.ts";

const HEX_WORD = /^TS_[0-9a-f]{32}$/u;
const HEX = "0123456789abcdef0123456789abcdef";

const MADE_FOLDERS = new Set(["tmp", "tasks", "state"]);

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

const aged = (folder: string, name: string, seconds: number, text = "x") => {
  const file = join(folder, name);

  writeFileSync(file, text);
  ageBy(file, seconds);
};

describe("the script makes a fresh delimiter and stores the text of a heredoc unchanged in ~/threadsift/tmp", () => {
  let world: ScriptWorld;

  const run = async (args: readonly string[], input = "") =>
    (await world.folder.run(args, world.env(), input)).word;

  const stored = (name: string) => join(world.folder.path, "tmp", name);

  const entries = () => world.folder.tree().filter((entry) => !MADE_FOLDERS.has(entry));

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

  it("stores text with shell syntax, quotes, backslashes and lines that look like delimiters byte for byte, and runs none of it", async () => {
    const { delimiter, ran } = await world.folder.heredoc("event-<hex>.json", HOSTILE);
    const name = `event-${delimiter.slice(3)}.json`;

    assert.equal(ran.word, "ok");
    assert.equal(readFileSync(stored(name), "utf8"), HOSTILE);
    assert.equal(existsSync(join(world.folder.path, "pwned")), false);
    assert.equal(existsSync(stored("pwned")), false);
  });

  it("answers bad-input and writes nothing for a name without the hex of a mark, a path, a name the script writes itself, and a text over the cap", async () => {
    const unchanged = entries();

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
      entries().filter((entry) => !unchanged.includes(entry)),
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
    const name = `big-${HEX.replaceAll("0", "9")}.txt`;
    assert.equal(await run(["write", name], "a".repeat(ITEM_REQUEST_BYTES - 5)), "ok");
    const file = stored(name);
    const kept = readFileSync(file);
    const unchanged = world.folder.tree();

    assert.equal(await run(["append", `missing-${HEX}.txt`], "text"), "bad-input");
    assert.deepEqual(world.folder.tree(), unchanged);
    assert.equal(await run(["append", `big-${HEX}.txt`], "x"), "bad-input");
    assert.equal(await run(["append", name], "b".repeat(10)), "bad-input");
    assert.equal(await run(["append", "../x.txt"], "x"), "bad-input");
    assert.deepEqual(readFileSync(file), kept);
    assert.deepEqual(
      world.folder.tree().filter((entry) => entry.includes(".part") || entry.includes(".join")),
      [],
    );
    assert.equal(await run(["append", name], "b".repeat(5)), "ok");
    assert.equal(readFileSync(file).length, ITEM_REQUEST_BYTES);
  });

  it("forgets the search and topics files of one hex and no other file, and answers bad-input and changes nothing for a word that is not the hex of a mark", async () => {
    const other = HEX.replaceAll("0", "9");
    const folder = new ScriptFolder();
    const forget = async (word: string) => (await folder.run(["forget", word], {})).word;

    try {
      const written = await Promise.all(
        [`search-${HEX}.json`, `topics-${HEX}.json`, `search-${other}.json`, `link-${HEX}.txt`].map(
          async (name) => (await folder.run(["write", name], {}, "text")).word,
        ),
      );

      assert.deepEqual(written, ["ok", "ok", "ok", "ok"]);
      assert.equal(await forget(HEX), "ok");
      assert.deepEqual(readdirSync(join(folder.path, "tmp")).toSorted(), [
        `link-${HEX}.txt`,
        `search-${other}.json`,
      ]);

      const unchanged = folder.tree();

      const words = await Promise.all(
        ["", "../x", "ABC", HEX.toUpperCase(), `${HEX}0`].map((word) => forget(word)),
      );

      assert.deepEqual(words, ["bad-input", "bad-input", "bad-input", "bad-input", "bad-input"]);
      assert.deepEqual(folder.tree(), unchanged);
    } finally {
      folder.remove();
    }
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

    ageBy(old, justPast(DAY));
    ageBy(recent, justBefore(DAY));

    assert.equal(await run(["write", `new-${HEX}.txt`], "text"), "ok");
    assert.equal(existsSync(old), false);
    assert.equal(existsSync(recent), true);
  });

  it("deletes the folder of a task that was done more than 7 days ago and the folder of a task left open for more than a day, a part file and a task folder left for more than a day, when it runs a command", async () => {
    const finished = world.folder.taskFolder(111);
    const abandoned = world.folder.taskFolder(222);
    const recent = world.folder.taskFolder(333);
    const kept = world.folder.taskFolder(444);
    const fresh = world.folder.taskFolder(555);
    const empty = world.folder.taskFolder(666);

    for (const folder of [finished, abandoned, recent, kept, fresh, empty]) {
      mkdirSync(folder, { recursive: true });
    }

    aged(finished, "done", justPast(7 * DAY));
    aged(abandoned, "token", justPast(DAY));
    aged(abandoned, "task.json", justPast(DAY), "{}");
    aged(recent, "done", justBefore(7 * DAY));
    aged(kept, "done", 0);
    aged(kept, "task.json", justPast(DAY), "{}");
    aged(kept, "token", justPast(DAY));
    aged(fresh, "token", justBefore(DAY));
    aged(fresh, "task.json", justBefore(DAY), "{}");
    aged(fresh, "token.part.AAAAAA", justPast(DAY));
    aged(fresh, "task.json.part.BBBBBB", justBefore(DAY));
    ageBy(empty, justPast(DAY));

    assert.equal(await run(["check"]), "ok");
    assert.equal(existsSync(finished), false);
    assert.equal(existsSync(abandoned), false);
    assert.equal(existsSync(join(recent, "done")), true);
    assert.equal(existsSync(join(kept, "task.json")), true);
    assert.equal(existsSync(join(kept, "token")), false);
    assert.equal(existsSync(join(fresh, "token")), true);
    assert.deepEqual(readdirSync(fresh).toSorted(), [
      "task.json",
      "task.json.part.BBBBBB",
      "token",
    ]);
    assert.equal(existsSync(empty), false);
  });
});
