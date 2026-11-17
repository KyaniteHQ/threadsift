import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const EXCLUDED_DOCS: readonly string[] = [
  "docs/research/",
  "docs/design/reviews/",
  "bot/CHANGELOG.md",
  "docs/design/claude-design-prompts.md",
  ".claude/skills/impeccable/",
  ".agents/skills/impeccable/",
  ".claude/agents/impeccable-",
];

const FILE_EXTENSION =
  /\.(?:md|[cm]?[jt]sx?|jsonc?|jsonl|ya?ml|nix|css|html|sql|sh|toml|lock|txt|svg|png|jpe?g|webp|ico|csv|edn|example)$/u;

const FENCE = /^\s*(?:`{3,}|~{3,})/u;
const PLANNED = /not built/iu;
const SPAN = /`([^`\n]+)`/gu;
const PAIR = /`([^`\n]+)`(?: in |\s\()`([^`\n]+)`/gu;
const LINK = /\]\(([^)\s]+)\)/gu;
const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/u;
const PATH_SPAN = /^(?<path>[\w.@+\-/*]+?)(?:#[\w.-]+)?(?::(?<from>\d+)(?:-(?<to>\d+))?)?$/u;
const SYMBOL_SPAN = /^(?<chain>(?:[A-Za-z_$][\w$]*\.)*[A-Za-z_$][\w$]*)(?:\(.*\))?$/u;

export interface Repository {
  readonly files: Readonly<ReadonlySet<string>>;
  readonly tracked: Readonly<ReadonlySet<string>>;
  readonly directories: Readonly<ReadonlySet<string>>;
  readonly topLevel: Readonly<ReadonlySet<string>>;
}

export interface PathRef {
  readonly span: string;
  readonly paths: readonly string[];
  readonly glob: boolean;
  readonly lines: readonly [from: number, to: number] | undefined;
}

export interface SymbolPair {
  readonly symbol: string;
  readonly ref: PathRef;
}

export interface DocLine {
  readonly doc: string;
  readonly number: number;
  readonly planned: boolean;
  readonly refs: readonly PathRef[];
  readonly spans: readonly string[];
  readonly pairs: readonly SymbolPair[];
}

export function runGit(args: readonly string[]): string {
  const result = spawnSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });

  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }

  return result.stdout;
}

export function exists(path: string): boolean {
  return existsSync(`${ROOT}${path}`);
}

export function readText(path: string): string {
  return readFileSync(`${ROOT}${path}`, "utf8");
}

function listFiles(...options: readonly string[]): string[] {
  return runGit(["ls-files", ...options, "-z"])
    .split("\0")
    .filter((path) => path !== "" && exists(path));
}

function baseRootNames(): string[] {
  try {
    const base = runGit(["merge-base", "origin/main", "HEAD"]).trim();

    return runGit(["ls-tree", "--name-only", base]).split("\n");
  } catch {
    return [];
  }
}

export function readRepository(): Repository {
  const tracked = listFiles("--cached");
  const files = [...new Set([...tracked, ...listFiles("--others", "--exclude-standard")])];
  const directories = new Set<string>();

  for (const path of files) {
    for (let dir = posix.dirname(path); dir !== "."; dir = posix.dirname(dir)) directories.add(dir);
  }

  return {
    files: new Set(files),
    tracked: new Set(tracked),
    directories,
    topLevel: new Set([...files.map((path) => path.split("/")[0] ?? path), ...baseRootNames()]),
  };
}

export function docPaths(repository: Repository): string[] {
  return [...repository.tracked]
    .filter((path) => path.endsWith(".md"))
    .filter((path) => !EXCLUDED_DOCS.some((excluded) => path.startsWith(excluded)))
    .filter((path) => posix.basename(path) !== "UPSTREAM.md")
    .toSorted();
}

function resolved(raw: string, doc: string, relative: boolean): string | undefined {
  if (raw.startsWith("/")) return undefined;

  const path = relative || /^\.{1,2}\//u.test(raw) ? posix.join(posix.dirname(doc), raw) : raw;

  return path.startsWith("../") ? undefined : path;
}

function isPath(path: string, directory: boolean, repository: Repository): boolean {
  if (path === "") return false;

  const [first = "", ...rest] = path.split("/");

  if (first.startsWith("@") || (rest.length > 0 && /^[^.]+\.[^.]/u.test(first))) return false;

  if (path.includes("*")) return rest.length > 0;

  if (rest.length === 0) return repository.topLevel.has(first);

  return directory || FILE_EXTENSION.test(path) || repository.topLevel.has(first);
}

function candidates(path: string, doc: string, relative: boolean): string[] {
  const own = posix.join(posix.dirname(doc), path);

  return relative || own === path ? [path] : [path, own];
}

function parsePath(span: string, doc: string, repository: Repository): PathRef | undefined {
  const groups = PATH_SPAN.exec(span)?.groups;
  const raw = groups?.["path"];
  const path = raw === undefined ? undefined : resolved(raw, doc, false)?.replace(/\/$/u, "");

  if (raw === undefined || path === undefined || !isPath(path, raw.endsWith("/"), repository)) {
    return undefined;
  }

  const from = groups?.["from"];
  const to = groups?.["to"] ?? from;
  const relative = /^\.{1,2}\//u.test(raw);

  return {
    span,
    paths: candidates(path, doc, relative),
    glob: path.includes("*"),
    lines: from === undefined || to === undefined ? undefined : [Number(from), Number(to)],
  };
}

function linkRefs(text: string, doc: string): PathRef[] {
  return [...text.replaceAll(SPAN, "").matchAll(LINK)].flatMap((match) => {
    const target = (match[1] ?? "").split(/[#?]/u)[0] ?? "";
    const path = SCHEME.test(target) ? undefined : resolved(target, doc, true)?.replace(/\/$/u, "");

    return path === undefined || path === ""
      ? []
      : [{ span: target, paths: [path], glob: false, lines: undefined }];
  });
}

function treeRefs(text: string, doc: string, repository: Repository): PathRef[] {
  return (text.split(/\s{2,}/u)[0] ?? "")
    .split(/,\s*/u)
    .flatMap((token) => parsePath(token.trim(), doc, repository) ?? []);
}

function backticked(text: string): string[] {
  return [...text.matchAll(SPAN)].flatMap((match) => match[1] ?? []);
}

function pairsOf(text: string, doc: string, repository: Repository): SymbolPair[] {
  return [...text.matchAll(PAIR)].flatMap((match) => {
    const ref = parsePath(match[2] ?? "", doc, repository);

    return match[1] === undefined || ref === undefined ? [] : [{ symbol: match[1], ref }];
  });
}

export function docLines(doc: string, repository: Repository): DocLine[] {
  const lines: DocLine[] = [];
  let fenced = false;

  readText(doc)
    .split("\n")
    .forEach((text, index) => {
      const number = index + 1;
      const planned = PLANNED.test(text);

      if (FENCE.test(text)) {
        fenced = !fenced;
      } else if (fenced) {
        lines.push({
          doc,
          number,
          planned,
          refs: treeRefs(text, doc, repository),
          spans: [],
          pairs: [],
        });
      } else {
        const spans = backticked(text);

        lines.push({
          doc,
          number,
          planned,
          refs: [
            ...spans.flatMap((span) => parsePath(span, doc, repository) ?? []),
            ...linkRefs(text, doc),
          ],
          spans,
          pairs: pairsOf(text, doc, repository),
        });
      }
    });

  return lines;
}

export function symbolChain(span: string): string[] | undefined {
  return SYMBOL_SPAN.exec(span)?.groups?.["chain"]?.split(".");
}

export function globMatches(glob: string, paths: Readonly<Iterable<string>>): string[] {
  return [...paths].filter((path) => posix.matchesGlob(path, glob));
}

export function escapeRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

export function isIgnored(path: string): boolean {
  return [path, `${path}/`].some(
    (candidate) =>
      spawnSync("git", ["check-ignore", "-q", "--", candidate], { cwd: ROOT }).status === 0,
  );
}
