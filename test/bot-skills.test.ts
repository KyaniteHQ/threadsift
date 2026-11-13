import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { ScriptFolder } from "./bot-script-run.ts";
import { assertExamplesAccepted } from "./bot-skills-examples.ts";
import {
  type Command,
  DOC_PATHS,
  LOCAL_COMMANDS,
  ROUTINE_PATHS,
  SKILL_PATH,
  botFile,
  commandsOf,
  fencesOf,
  frontmatterOf,
  proseOf,
  reasonsOf,
  scriptText,
  scriptWordsOf,
  sectionOf,
  spansOf,
  wordArmsOf,
  wordOf,
} from "./bot-skills-reader.ts";
import { type OpenApi, OpenApiSchema, SCRIPT_CALL } from "./bot-skills-vocabulary.ts";
import { Instance } from "./instance.ts";

const DESCRIPTION_MAX = 1024;

const WORD = /^[a-z]+(?:-[a-z]+)*$/u;

const CALLS = new Set([SCRIPT_CALL, "threadsift.sh"]);

const PLACEHOLDER = /^[<[][A-Za-z0-9]+[>\]]$/u;

const HEX_PLACEHOLDER = /<hex[12]?>/gu;

const FILE_NAME = /^[a-z]+-<hex[12]?>\.(?:json|txt)$/u;

const SCRIPT_PATH = /^~\/threadsift\/(?:tmp|tasks\/<taskId>)\/[A-Za-z0-9<>._-]+$/u;

function argumentsOf(span: string, commandNames: ReadonlySet<string>): readonly string[] | null {
  const [first = "", ...rest] = span.split(" ");
  const [name = "", ...args] = CALLS.has(first) ? rest : [first, ...rest];

  return commandNames.has(name) && (CALLS.has(first) || args.length > 0 || rest.length === 0)
    ? args
    : null;
}

describe("the Threadsift bot files say only what the script, the API and the schemas contain", () => {
  let instance: Instance;
  let document: OpenApi;

  const script = scriptText();
  const commands = commandsOf(script);
  const arms = wordArmsOf(script);
  const skill = botFile(SKILL_PATH);

  const statusesOf = ({ template, method }: Readonly<Pick<Command, "template" | "method">>) =>
    Object.keys(document.paths[template]?.[method.toLowerCase()]?.responses ?? {});

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    document = OpenApiSchema.parse(
      JSON.parse((await instance.send("GET", "/api/openapi.json")).body),
    );
  });

  after(() => instance.close());

  it("has one skill, named threadsift, with a description that fits the limit", () => {
    const { name, description = "" } = frontmatterOf(skill.text);

    assert.deepEqual(readdirSync(join(import.meta.dirname, "..", "bot", "skills")), ["threadsift"]);
    assert.equal(name, "threadsift");
    assert.ok(description.length > 0 && description.length <= DESCRIPTION_MAX);
  });

  it("sends from the script only to routes the OpenAPI document has and prints a word for every status of each", () => {
    assert.deepEqual(
      commands.map(({ name }) => name),
      [
        "check",
        "topics",
        "search",
        "save",
        "task-open",
        "task-answer",
        "task-intake",
        "task-error",
      ],
    );

    const unmapped = commands.flatMap((command) =>
      statusesOf(command)
        .filter((status) => wordOf(arms, { command: command.name, status }) === undefined)
        .map((status) => `${command.name} ${status}`),
    );

    const undocumented = [...arms.keys()]
      .filter((key) => key !== "*")
      .filter((key) => {
        const [name = "", status = ""] = key.split(":");
        const routes = name === "*" ? commands : commands.filter((found) => found.name === name);

        return status !== "000" && !routes.some((found) => statusesOf(found).includes(status));
      });

    assert.deepEqual([unmapped, undocumented], [[], []]);
  });

  it("lists in the skill every word, every command and every reason word the script has", () => {
    const section = sectionOf(skill.text, "Script words");
    const spans = spansOf(section);

    const known = new Set([
      ...scriptWordsOf(script),
      ...commands.map(({ name }) => name),
      ...LOCAL_COMMANDS,
    ]);

    for (const span of spans.filter((found) => WORD.test(found))) assert.ok(known.has(span), span);

    for (const word of scriptWordsOf(script)) assert.ok(spans.includes(word), word);

    const named = [
      ...commands.map(({ name }) => name).filter((name) => name !== "task-intake"),
      ...LOCAL_COMMANDS,
    ];

    for (const name of named) {
      assert.ok(
        spans.some((span) => {
          const tokens = span.split(" ");

          return tokens[CALLS.has(tokens[0] ?? "") ? 1 : 0] === name;
        }),
        name,
      );
    }

    assert.deepEqual(
      reasonsOf(script).filter((word) => !spansOf(skill.text).some((span) => span.includes(word))),
      [],
    );
  });

  it("takes no shell word from outside the script: every command of the bot files has only a task id placeholder, a fixed word of the script or a path under ~/threadsift", () => {
    const commandNames = new Set([
      ...commands.map(({ name }) => name).filter((name) => name !== "task-intake"),
      ...LOCAL_COMMANDS,
    ]);

    const fixed = new Set(reasonsOf(script));
    const shown = DOC_PATHS.flatMap((path) => spansOf(proseOf(botFile(path).text)));

    const bad = shown.flatMap((span) =>
      (argumentsOf(span, commandNames) ?? []).filter(
        (arg) =>
          !(
            PLACEHOLDER.test(arg) ||
            FILE_NAME.test(arg) ||
            SCRIPT_PATH.test(arg) ||
            fixed.has(arg)
          ),
      ),
    );

    assert.deepEqual(bad, []);
    assert.ok(
      shown.filter((span) => (argumentsOf(span, commandNames)?.length ?? 0) > 0).length >= 5,
    );
  });

  it("names, in each routine and the profile, a section the skill has, and gives setup the text of each routine", () => {
    const setup = botFile("setup.md").text;

    for (const path of [...ROUTINE_PATHS, "profile.md"]) {
      const { text } = botFile(path);

      for (const [, section = ""] of text.matchAll(/skill: ([a-z ]+?)[,.]/gu)) {
        assert.ok(skill.text.toLowerCase().includes(`## ${section}\n`), `${path} ${section}`);
      }
    }

    for (const path of ROUTINE_PATHS) {
      const prompt = botFile(path).text.split("Prompt:\n\n")[1]?.trim() ?? "";

      assert.notEqual(prompt, "");
      assert.ok(setup.includes(prompt), path);
    }
  });

  it("shows a thread, a Digest and answers that the production schemas accept", () => {
    assertExamplesAccepted();
    assert.ok(spansOf(proseOf(skill.text)).includes('{ "unavailable": true }'));
  });

  it("writes text to a file only through a heredoc whose delimiter is the word mark printed, in single quotes, on every line of every bot text that has a heredoc", () => {
    const heredocs = DOC_PATHS.flatMap((path) =>
      [...botFile(path).text.matchAll(/^(.*?)<<-?\s*(\S+)/gmu)].map(
        ([, command = "", delimiter = ""]) => ({
          path,
          command: command.trim(),
          delimiter,
        }),
      ),
    );

    assert.ok(heredocs.length > 0);

    for (const { path, command, delimiter } of heredocs) {
      assert.match(delimiter, /^'TS_<hex[12]?>'$/u, path);
      assert.match(
        command,
        /^(?:~\/threadsift\/)?threadsift\.sh (?:write|append) [a-z]+-<hex[12]?>\.(?:json|txt)$/u,
        path,
      );
    }

    assert.ok(skill.text.includes("\n  TS_<hex1>\n"));
  });

  it("names only files that write accepts when a name carries the word of mark", async () => {
    const names = [
      ...new Set(
        DOC_PATHS.flatMap((path) =>
          spansOf(proseOf(botFile(path).text)).filter(
            (span) => /<hex[12]?>/u.test(span) && !span.includes(" ") && span.includes("."),
          ),
        ),
      ),
    ];

    const folder = new ScriptFolder();

    try {
      assert.ok(names.length >= 5);

      const words = await Promise.all(
        names.map(async (span) => {
          const name = (span.split("/").pop() ?? "")
            .replace("<kind>", "kind")
            .replaceAll(HEX_PLACEHOLDER, "0123456789abcdef0123456789abcdef");

          return (await folder.run(["write", name], {}, "text")).word;
        }),
      );

      assert.deepEqual(
        words,
        names.map(() => "ok"),
      );
    } finally {
      folder.remove();
    }
  });

  it("shows a bookmark cursor that bookmarks-set accepts", async () => {
    const shown = fencesOf(skill.text).find(({ label }) => label === "cursor");
    const folder = new ScriptFolder();

    try {
      const file = await folder.made("bookmarks", (shown?.body ?? "").replace("<digits>", "123"));

      assert.equal((await folder.run(["bookmarks-set", file], {})).word, "ok");
    } finally {
      folder.remove();
    }
  });

  it("builds no address outside a code block", () => {
    for (const path of DOC_PATHS) {
      assert.equal(proseOf(botFile(path).text).match(/https?:\/\/\S+/gu), null, path);
    }
  });
});
