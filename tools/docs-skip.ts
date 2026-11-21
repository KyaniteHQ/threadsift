import { statSync } from "node:fs";
import { posix } from "node:path";

import { visit } from "jsonc-parser";
import { z } from "zod";

import { escapeRegExp, readRepository, readText } from "./doc-lines.ts";
import { checkReads } from "./docs-skip-reads.ts";

const workflow = ".github/workflows/gate.yml";
const gate = readText(workflow);
const classifier = gate.match(/^ +docs_diff\(\) \{\n[\s\S]*?^ +\}$/mu)?.[0];
const arm = classifier
  ?.replaceAll("\\\n", "")
  .match(/^ +case "\$path" in\s+([^()\n]+)\)\s*;;\s+\*\) return 1 ;;\s+esac$/mu)?.[1];
if (classifier === undefined || arm === undefined)
  throw new Error(`${workflow}: cannot read the docs_diff skip list; check its case arms`);

const patterns = arm.split("|").map((part) => {
  const token = part.trim();
  const match = /^(?:([\w./*?-]+)|"([\w./*?-]+)"|'([\w./*?-]+)')$/u.exec(token);
  if (!match) throw new Error(`${workflow}: unsupported docs_diff skip list pattern ${token}`);
  const literal = escapeRegExp(match[1] ?? match[2] ?? match[3] ?? "");
  const expression =
    match[1] === undefined ? literal : literal.replaceAll("\\*", ".*").replaceAll("\\?", ".");
  return new RegExp(`^${expression}$`, "u");
});

const { files } = readRepository();
const skipped = [...files].filter((path) => patterns.some((pattern) => pattern.test(path)));
if (skipped.length === 0)
  throw new Error(`${workflow}: the docs-only skip list matches no repository files`);

function fail(file: string, line: number, message: string): void {
  process.stderr.write(`${file}:${String(line)}: ${message}\n`);
  process.exitCode = 1;
}

const ignoreFile = files.has(".containerignore") ? ".containerignore" : ".dockerignore";
const ignoreRules = readText(ignoreFile)
  .split("\n")
  .flatMap((line, i) => {
    const rule = line.trim();
    if (rule === "" || rule.startsWith("#")) return [];
    const path = rule.replace(/^!/u, "").replaceAll(/^\/|\/$/gu, "");
    if (!/^[\w./*?-]+$/u.test(path))
      throw new Error(
        `${ignoreFile}:${String(i + 1)}: cannot verify image exclusion pattern ${rule}`,
      );
    const glob = posix.normalize(path).replace(/\/$/u, "");
    const segments = glob.match(/\*\*\/|\*\*|\*|\?|[^*?]+/gu) ?? [];
    const expression = segments
      .map((part) => {
        if (part === "**/") return "(?:.*/)?";
        if (part === "**") return ".*";
        if (part === "*") return "[^/]*";
        if (part === "?") return "[^/]";
        return escapeRegExp(part);
      })
      .join("");
    return [
      {
        matches: new RegExp(`^${expression}(?:/|$)`, "u"),
        include: rule.startsWith("!"),
        line: i + 1,
      },
    ];
  });
for (const path of skipped) {
  const last = ignoreRules.findLast((rule) => rule.matches.test(path));
  if (!last || last.include)
    fail(
      ignoreFile,
      last?.line ?? 1,
      `exclude ${path} from the image build context or remove it from the docs-only skip list`,
    );
}

function checkPath(file: string, line: number, input: string): void {
  const path = posix.normalize(input).replace(/\/$/u, "");
  const hit = patterns.some((pattern) => pattern.test(path))
    ? path
    : skipped.find(
        (entry) =>
          input === "." ||
          entry === path ||
          entry.startsWith(`${path}/`) ||
          (/[?*[{]/u.test(path) && posix.matchesGlob(entry, path)),
      );
  if (hit !== undefined)
    fail(file, line, `remove ${hit} from the docs-only skip list (input ${input})`);
}

function checkWords(file: string, line: number, command: string): void {
  for (const [word] of command.matchAll(/[\w./*?-]+/gu)) {
    if (word !== "." && word !== "/" && word !== "*" && !word.startsWith("-"))
      checkPath(file, line, word);
  }
}

const taskCommands = [
  readText("devenv.nix"),
  gate,
  ...[...files].flatMap((file) =>
    file.startsWith(".github/actions/") && /\.ya?ml$/u.test(file) ? [readText(file)] : [],
  ),
].join("\n");
const scripts = new Map<string, { file: string; command: string }[]>();
for (const file of files) {
  if (posix.basename(file) !== "package.json" && file !== "wrangler.jsonc") continue;
  visit(readText(file), {
    onLiteralValue(raw, _offset, _length, line, _column, location) {
      const keys = location();
      const command = z.string().safeParse(raw).data;
      if (command === undefined) return;
      if (keys[0] === "scripts") {
        const key = String(keys[1]);
        scripts.set(key, [...(scripts.get(key) ?? []), { file, command }]);
        checkWords(file, line + 1, command);
      } else if (
        keys[0] === "files" ||
        (file === "wrangler.jsonc" &&
          keys.some((key) => ["assets", "build", "main", "migrations_dir"].includes(String(key))))
      ) {
        checkWords(file, line + 1, command);
      }
    },
  });
}
function calledScripts(command: string): string[] {
  return Array.from(
    command.matchAll(/\bpnpm\s+(?:--filter\s+\S+\s+)?(?:run\s+)?([\w:-]+)/gu),
    ([, script]) => script ?? "",
  ).filter((script) => script !== "check");
}
const inputs = new Set<string>();
const activeScripts = new Set(calledScripts(taskCommands));
for (const name of activeScripts) {
  for (const { file, command } of scripts.get(name) ?? []) {
    discoverTools(file, command);
    for (const child of calledScripts(command)) activeScripts.add(child);
  }
}
function requireFiles(glob: string): void {
  const matched = [...files].filter((file) => posix.matchesGlob(file, glob));
  if (matched.length === 0)
    throw new Error(`No repository inputs match ${glob}; check the docs-only scan scope`);
}

const sourceType = /\.[cm]?[jt]sx?$/u;
const commandType = /\.(?:sh|sql|nix|ya?ml)$/u;
for (const file of files) {
  if (file.startsWith("tools/") || file === "oxlint.config.ts" || file === "pnpm-lock.yaml")
    continue;
  if (
    sourceType.test(file) ||
    commandType.test(file) ||
    (taskCommands.includes(file) &&
      posix.extname(file) === "" &&
      statSync(file).isFile() &&
      readText(file).startsWith("#!"))
  )
    inputs.add(file);
}
for (const glob of [
  "extension/**/*.{ts,tsx}",
  "migrations/**/*.sql",
  ".github/actions/**/action.y{a,}ml",
])
  requireFiles(glob);
visit(readText("tsconfig.json"), {
  onLiteralValue(raw, _offset, _length, _line, _column, location) {
    const value = z.string().safeParse(raw).data;
    if (location()[0] === "include" && value !== undefined) {
      requireFiles(value);
      checkPath("tsconfig.json", _line + 1, value);
    }
  },
});

function addTool(file: string, path: string): void {
  const target = posix.normalize(path);
  if (!target.startsWith("tools/") || !/\.(?:[cm]?[jt]sx?|sh)$/u.test(target)) return;
  if (!files.has(target)) throw new Error(`${file}: missing tool input ${target}`);
  inputs.add(target);
}

function discoverTools(file: string, executable: string): void {
  for (const [path] of executable.matchAll(/(?<![\w./-])tools\/[\w./-]+\.(?:[cm]?[jt]s|sh)\b/gu)) {
    addTool(file, path);
  }
}

for (const file of inputs) {
  const source = readText(file);
  const check = (path: string, line: number): void => {
    checkPath(file, line, path);
    addTool(file, path);
  };
  let executable = source;
  if (file === workflow)
    executable = source.replace(classifier, classifier.replaceAll(/[^\n]/gu, " "));
  if (sourceType.test(file)) {
    checkReads(file, source, check);
    continue;
  }
  executable.split("\n").forEach((line, i) => {
    if (/^\s*(?:#|--)/u.test(line)) return;
    if (
      /\.ya?ml$/u.test(file) &&
      /^\s*(?:- )?[\w-]+:/u.test(line) &&
      !line.includes("hashFiles(") &&
      !/^\s*(?:- )?(?:run|path|paths|file|uses|working-directory):/u.test(line)
    )
      return;
    checkWords(file, i + 1, line);
  });
  discoverTools(file, executable);
  for (const match of executable.matchAll(/(?:uses:\s*\.\/)([\w./-]+)/gu))
    requireFiles(`${match[1]}/action.y{a,}ml`);
}
