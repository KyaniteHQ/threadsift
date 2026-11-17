import {
  docLines,
  docPaths,
  escapeRegExp,
  matchesAny,
  isIgnored,
  readRepository,
  readText,
  symbolChain,
  type DocLine,
  type PathRef,
  type Repository,
} from "./doc-lines.ts";

const OTHER_PROJECT_SPANS: ReadonlyMap<string, readonly string[]> = new Map([
  ["docs/architecture/access-owner-login-agent-tokens-mcp.md", ["tools/list"]],
  ["docs/architecture/ci-releases-and-rollback.md", ["src/libfetchers/github.cc"]],
  ["docs/architecture/data-model-outline.md", ["src/annotator/anchoring/"]],
  ["docs/architecture/fetchers.md", ["src/extractors/c2-wiki.ts", "lib/util/date.js"]],
  ["docs/architecture/files.md", ["items/1/", "items/10/"]],
]);

const OTHER_PROJECT_SYMBOLS: ReadonlySet<string> = new Set(["env.AI.run"]);

const repository = readRepository();
const failures: string[] = [];

function fail(line: Readonly<DocLine>, what: string, reason: string): void {
  failures.push(`${line.doc}:${line.number}: \`${what}\` ${reason}`);
}

function wholeWord(word: string, content: string): boolean {
  return new RegExp(`(?<![\\w$])${escapeRegExp(word)}(?![\\w$])`, "u").test(content);
}

function lineCount(content: string): number {
  if (content === "") return 0;

  return content.endsWith("\n") ? content.split("\n").length - 1 : content.split("\n").length;
}

function checkLines(line: Readonly<DocLine>, ref: Readonly<PathRef>, path: string): void {
  if (ref.lines === undefined) return;

  const total = lineCount(readText(path));
  const [from, to] = ref.lines;

  if (from < 1 || to < from || to > total) {
    const cited = from === to ? `line ${from}` : `lines ${from}-${to}`;

    fail(line, ref.span, `names ${cited}, and ${path} has ${total} lines`);
  }
}

function absence(ref: Readonly<PathRef>, repo: Repository): string | undefined {
  if (ref.glob) {
    return matchesAny(ref.paths, repo.files) ? undefined : "matches no file";
  }

  const found = ref.paths.some((path) => repo.files.has(path) || repo.directories.has(path));

  return found || ref.paths.some((path) => isIgnored(path)) ? undefined : "does not exist";
}

function checkPath(line: Readonly<DocLine>, ref: Readonly<PathRef>, repo: Repository): void {
  const absent = absence(ref, repo);

  if (absent !== undefined) {
    if (!line.planned) fail(line, ref.span, absent);

    return;
  }

  const file = ref.paths.find((path) => repo.files.has(path));

  if (file !== undefined) checkLines(line, ref, file);
  else if (ref.lines !== undefined && !ref.glob) {
    fail(line, ref.span, "is a directory or an ignored path, and has no lines to count");
  }
}

function checkSymbol(
  line: Readonly<DocLine>,
  symbol: string,
  ref: Readonly<PathRef>,
  repo: Repository,
): void {
  const chain = symbolChain(symbol);

  if (chain === undefined || OTHER_PROJECT_SYMBOLS.has(chain.join("."))) return;

  const file = ref.paths.find((path) => repo.files.has(path));

  if (ref.glob || file === undefined) return;

  const content = readText(file);

  if (chain.some((name) => !wholeWord(name, content))) {
    fail(line, symbol, `does not appear in ${file}`);
  }
}

for (const doc of docPaths(repository)) {
  for (const line of docLines(doc, repository)) {
    const exempt = OTHER_PROJECT_SPANS.get(doc) ?? [];

    for (const ref of line.refs) {
      if (!exempt.includes(ref.span)) checkPath(line, ref, repository);
    }

    for (const pair of line.pairs) {
      checkSymbol(line, pair.symbol, pair.ref, repository);
    }
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n")}\n${failures.length} broken doc references\n`);
  process.exit(1);
}
