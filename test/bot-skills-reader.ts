import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const BOT = join(import.meta.dirname, "..", "bot");

const FENCE = /^( *)```(\S*)(?: (\S+))?\n([\s\S]*?)^\1```$/gmu;

const COMMAND_ARM =
  /^ {4}([\w-]+)\) method=([A-Z]+); template="([^"]+)"; credential=(agent|task) ;;$/gmu;

const WORD_ARM = /^ {4}([\w:*|-]+)\) echo ([a-z]+(?:-[a-z]+)*) ;;$/gmu;

const REASON_ARM = /^ {4}([a-z]+(?:-[a-z]+)*)\) sentence="/gmu;

export interface Fence {
  readonly language: string;
  readonly label: string;
  readonly body: string;
}

export interface BotFile {
  readonly path: string;
  readonly text: string;
}

export interface Command {
  readonly name: string;
  readonly method: string;
  readonly template: string;
  readonly credential: string;
}

export const botFile = (path: string): BotFile => ({
  path: join("bot", path),
  text: readFileSync(join(BOT, path), "utf8"),
});

export const SKILL_PATH = join("skills", "threadsift", "SKILL.md");

export const ROUTINE_PATHS = [
  join("routines", "threadsift-webhook.md"),
  join("routines", "threadsift-bookmarks.md"),
];

export const DOC_PATHS = [
  SKILL_PATH,
  "README.md",
  "setup.md",
  "update.md",
  "profile.md",
  ...ROUTINE_PATHS,
];

export const LOCAL_COMMANDS = ["mark", "write", "append", "forget"];

export const scriptText = (): string => botFile(join("scripts", "threadsift.sh")).text;

export const versionText = (): string => botFile("VERSION").text.trim();

export function fencesOf(text: string): readonly Fence[] {
  return [...text.matchAll(FENCE)].map(([, , language = "", label = "", body = ""]) => ({
    language,
    label,
    body,
  }));
}

export function proseOf(text: string): string {
  return text.replaceAll(FENCE, "");
}

export function spansOf(prose: string): readonly string[] {
  return [...prose.matchAll(/`([^`\n]+)`/gu)].map(([, span = ""]) => span);
}

export function frontmatterOf(text: string): Readonly<Record<string, string>> {
  const block = /^---\n([\s\S]*?)\n---\n/u.exec(text)?.[1] ?? "";
  const flat = block.replaceAll(/\n {2}/gu, " ").replaceAll(/: >-\s+/gu, ": ");

  return Object.fromEntries(
    flat.split("\n").map((line) => {
      const colon = line.indexOf(": ");

      return [line.slice(0, colon), line.slice(colon + 2)];
    }),
  );
}

export function commandsOf(script: string): readonly Command[] {
  return [...script.matchAll(COMMAND_ARM)].map(
    ([, name = "", method = "", template = "", credential = ""]) => ({
      name,
      method,
      template,
      credential,
    }),
  );
}

export function flagsOf(script: string): readonly string[] {
  return [
    ...new Set(
      [...script.matchAll(/^ {10}([a-z]*):([a-z]*)\) import_name=/gmu)].flatMap(
        ([, first = "", second = ""]) => [first, second].filter((word) => word !== ""),
      ),
    ),
  ];
}

const BOOKMARK_COMMANDS = new Set(["bookmarks-cursor", "bookmarks-send"]);

export const WITHOUT_STATUS = ["unreachable", "failed", "bad-input", "not-configured"];

export function bookmarkWordsOf(
  script: string,
  statusesOf: (command: Command) => readonly string[],
): ReadonlySet<string> {
  const arms = wordArmsOf(script);
  const words = new Set(WITHOUT_STATUS);

  for (const command of commandsOf(script).filter(({ name }) => BOOKMARK_COMMANDS.has(name))) {
    for (const status of statusesOf(command)) {
      words.add(wordOf(arms, { command: command.name, status }) ?? "");
    }
  }

  words.delete("");
  words.delete("ok");

  return words;
}

export function reasonsOf(script: string): readonly string[] {
  return [...script.matchAll(REASON_ARM)].map(([, word = ""]) => word);
}

export function wordArmsOf(script: string): ReadonlyMap<string, string> {
  return new Map(
    [...script.matchAll(WORD_ARM)].flatMap(([, keys = "", word = ""]) =>
      keys.split("|").map((key): [string, string] => [key, word]),
    ),
  );
}

export function wordOf(
  arms: ReadonlyMap<string, string>,
  { command, status }: Readonly<{ command: string; status: string }>,
): string | undefined {
  return arms.get(`${command}:${status}`) ?? arms.get(`*:${status}`);
}

export function scriptWordsOf(script: string): readonly string[] {
  const named = [
    ...script.matchAll(/(?:echo|stop) ([a-z]+(?:-[a-z]+)*)(?=[ ;]|$)/gmu),
    ...script.matchAll(/word=([a-z]+(?:-[a-z]+)*)/gu),
  ].map(([, word = ""]) => word);

  return [...new Set([...wordArmsOf(script).values(), ...named])].toSorted();
}

export function sectionOf(text: string, heading: string): string {
  const start = text.indexOf(`## ${heading}\n`);

  assert.notEqual(start, -1, heading);

  return text.slice(start).split(/\n## /u)[0] ?? "";
}
