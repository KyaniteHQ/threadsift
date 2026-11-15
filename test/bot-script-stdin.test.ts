import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { type Ran } from "./bot-script-run.ts";
import { ScriptWorld } from "./bot-script-world.ts";
import { picksFor } from "./bot-task-fixtures.ts";

interface Case {
  readonly name: string;
  readonly word: RegExp;
  readonly code: number;
  readonly env?: () => Readonly<Record<string, string>>;
  readonly args: () => Promise<readonly string[]>;
  readonly taskId?: true;
  readonly stored?: string;
}

const comparable = ({ word, reasons, code }: Ran, hasTaskId: boolean) => {
  const normalized = word.replace(/^TS_[0-9a-f]{32}$/u, "TS_<hex>");

  return {
    word: hasTaskId ? normalized.replace(/^ok \d+ /u, "ok <id> ") : normalized,
    reasons,
    code,
  };
};

describe("the script prints the same word, reasons and exit code with standard input closed as with it open and empty, for every command", () => {
  let world: ScriptWorld;
  let counter = 0;

  const unique = () => {
    counter += 1;

    return counter;
  };

  const hexOfMark = async () => (await world.folder.run(["mark"], {})).word.slice("TS_".length);

  const openedTask = async () => {
    world.reset();

    const task = await world.result();

    await world.opened(task, "related_pick");

    return String(task.id);
  };

  const cases: readonly Case[] = [
    { name: "mark", word: /^TS_[0-9a-f]{32}$/u, code: 0, args: () => Promise.resolve(["mark"]) },
    {
      name: "forget",
      word: /^ok$/u,
      code: 0,
      args: async () => ["forget", await hexOfMark()],
    },
    {
      name: "forget with a word that is not a mark",
      word: /^bad-input$/u,
      code: 2,
      args: () => Promise.resolve(["forget", "nope"]),
    },
    {
      name: "write",
      word: /^ok$/u,
      code: 0,
      stored: "",
      args: async () => ["write", `empty-${await hexOfMark()}.txt`],
    },
    {
      name: "write with a bad name",
      word: /^bad-input$/u,
      code: 2,
      args: () => Promise.resolve(["write", "bad"]),
    },
    {
      name: "append",
      word: /^ok$/u,
      code: 0,
      stored: "first",
      args: async () => {
        const name = `part-${await hexOfMark()}.txt`;

        await world.folder.heredoc(name, "first");

        return ["append", name];
      },
    },
    {
      name: "append to a file write did not make",
      word: /^bad-input$/u,
      code: 2,
      args: async () => ["append", `none-${await hexOfMark()}.txt`],
    },
    { name: "check", word: /^ok$/u, code: 0, args: () => Promise.resolve(["check"]) },
    {
      name: "check against an Instance that is down",
      word: /^unreachable$/u,
      code: 0,
      env: () => world.env("http://127.0.0.1:1"),
      args: () => Promise.resolve(["check"]),
    },
    {
      name: "check with no address",
      word: /^not-configured$/u,
      code: 2,
      env: () => ({}),
      args: () => Promise.resolve(["check"]),
    },
    {
      name: "topics",
      word: /^ok$/u,
      code: 0,
      args: async () => ["topics", await hexOfMark()],
    },
    {
      name: "search",
      word: /^ok$/u,
      code: 0,
      args: async () => ["search", await world.folder.made("query", "backup", "txt")],
    },
    {
      name: "search that finds nothing",
      word: /^none$/u,
      code: 0,
      args: async () => ["search", await world.folder.made("query", "zzzqqqxxx", "txt")],
    },
    {
      name: "save",
      word: /^ok$/u,
      code: 0,
      args: async () => [
        "save",
        await world.folder.made("link", `https://example.com/stdin-${String(unique())}`, "txt"),
      ],
    },
    {
      name: "save with text that is not a link",
      word: /^bad-input$/u,
      code: 2,
      args: async () => ["save", await world.folder.made("link", "not a link", "txt")],
    },
    {
      name: "bookmarks-cursor",
      word: /^none$/u,
      code: 0,
      args: () => Promise.resolve(["bookmarks-cursor"]),
    },
    {
      name: "bookmarks-send",
      word: /^ok 1 0 0$/u,
      code: 0,
      args: async () => [
        "bookmarks-send",
        await world.folder.made(
          "bookmarks",
          JSON.stringify({ ids: [String(3_000_000_000_000_000_000n + BigInt(unique()))] }),
        ),
      ],
    },
    {
      name: "task-open",
      word: /^ok \d+ related_pick$/u,
      code: 0,
      taskId: true,
      args: async () => {
        world.reset();

        return [
          "task-open",
          world.folder.event(world.eventOf(await world.result(), "related_pick")),
        ];
      },
    },
    {
      name: "task-open with the connection test",
      word: /^ping$/u,
      code: 0,
      args: () => Promise.resolve(["task-open", world.folder.event('{"kind":"ping"}')]),
    },
    {
      name: "task-answer",
      word: /^ok$/u,
      code: 0,
      args: async () => [
        "task-answer",
        await openedTask(),
        await world.folder.made("answer", JSON.stringify(picksFor(world.candidate))),
      ],
    },
    {
      name: "task-error",
      word: /^ok$/u,
      code: 0,
      args: async () => ["task-error", await openedTask(), "no-answer"],
    },
    {
      name: "a command the script does not offer",
      word: /^bad-input$/u,
      code: 2,
      args: () => Promise.resolve(["bogus"]),
    },
  ];

  before(async () => {
    world = await ScriptWorld.start();
    await world.instance.tick();
  });

  after(() => world.close());

  const storedAfter = (testCase: Case, args: readonly string[]) => {
    if (testCase.stored !== undefined) {
      assert.equal(
        readFileSync(join(world.folder.path, "tmp", args[1] ?? ""), "utf8"),
        testCase.stored,
      );
    }
  };

  const sameBothWays = async (testCase: Case) => {
    const { word, code, env, args, taskId = false } = testCase;
    const environment = env ?? (() => world.env());
    const emptyArgs = await args();
    const empty = await world.folder.run(emptyArgs, environment());
    const closedArgs = await args();
    const closed = await world.folder.runWithClosedStdin(closedArgs, environment());

    assert.match(empty.word, word);
    assert.equal(empty.code, code);
    assert.deepEqual(comparable(closed, taskId), comparable(empty, taskId));
    storedAfter(testCase, emptyArgs);
    storedAfter(testCase, closedArgs);
  };

  for (const testCase of cases) {
    it(`answers ${testCase.name} the same with standard input closed and with it open and empty`, () =>
      sameBothWays(testCase));
  }
});
