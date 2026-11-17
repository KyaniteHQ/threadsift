import {
  docLines,
  docPaths,
  exists,
  matchesAny,
  readRepository,
  readText,
  runGit,
  symbolChain,
  type PathRef,
} from "./doc-lines.ts";

const EXPORT_DECLARATION =
  /^export\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:abstract\s+)?(?:function\*?|class|const|let|var|interface|type|enum|namespace)\s+(?<name>[A-Za-z_$][\w$]*)/gmu;

const EXPORT_LIST = /^export\s+(?:type\s+)?\{(?<names>[^}]*)\}/gmu;
const SOURCE_FILE = /\.[cm]?[jt]sx?$/u;

interface Change {
  readonly status: string;
  readonly before: string | undefined;
  readonly after: string | undefined;
}

function exportedNames(source: string): Set<string> {
  const listed = [...source.matchAll(EXPORT_LIST)].flatMap((match) =>
    (match.groups?.["names"] ?? "").split(",").flatMap((entry) => {
      const name = entry
        .trim()
        .replace(/^type\s+/u, "")
        .split(/\s+as\s+/u)
        .at(-1);

      return name === undefined || name === "" ? [] : [name];
    }),
  );

  const declared = [...source.matchAll(EXPORT_DECLARATION)].flatMap(
    (match) => match.groups?.["name"] ?? [],
  );

  return new Set([...listed, ...declared]);
}

function nameStatus(...revisions: readonly string[]): Change[] {
  return runGit(["-c", "core.quotepath=off", "diff", "-M", "--name-status", ...revisions])
    .split("\n")
    .filter((line) => line !== "")
    .map((line): Change => {
      const [status = "", first, second] = line.split("\t");

      return {
        status: status.slice(0, 1),
        before: status.startsWith("A") ? undefined : first,
        after: status.startsWith("D") ? undefined : (second ?? first),
      };
    });
}

function untracked(): Change[] {
  return runGit(["ls-files", "--others", "--exclude-standard"])
    .split("\n")
    .filter((path) => path !== "")
    .map((path): Change => ({ status: "A", before: undefined, after: path }));
}

function namedPaths({ status, before, after }: Readonly<Change>): string[] {
  const named = status === "A" || status === "C" ? [after] : [before, after];
  const contentOnly = status === "M" && before?.endsWith(".md") === true;

  return contentOnly ? [] : named.flatMap((path) => path ?? []);
}

function removedExports(mergeBase: string, changes: readonly Change[]): Set<string> {
  const removed = new Set<string>();

  for (const { before, after } of changes) {
    if (before === undefined || !SOURCE_FILE.test(before)) continue;

    const kept = new Set(
      after !== undefined && exists(after) ? exportedNames(readText(after)) : [],
    );

    for (const name of exportedNames(runGit(["show", `${mergeBase}:${before}`]))) {
      if (!kept.has(name)) removed.add(name);
    }
  }

  return removed;
}

function namedBy(ref: Readonly<PathRef>, paths: Readonly<ReadonlySet<string>>): string | undefined {
  if (ref.glob) return matchesAny(ref.paths, paths) ? ref.span : undefined;

  return ref.paths.find((path) => paths.has(path));
}

function impactSince(base: string): string[] {
  const mergeBase = runGit(["merge-base", base, "HEAD"]).trim();
  const net = nameStatus(mergeBase);
  const changes = [...nameStatus(mergeBase, "HEAD"), ...nameStatus("HEAD"), ...net, ...untracked()];
  const paths = new Set(changes.flatMap((change) => namedPaths(change)));
  const removed = removedExports(mergeBase, net);
  const repository = readRepository();
  const found: string[] = [];

  for (const doc of docPaths(repository)) {
    for (const line of docLines(doc, repository)) {
      const named = new Set<string>();

      for (const ref of line.refs) {
        const name = namedBy(ref, paths);

        if (name !== undefined) named.add(name);
      }

      for (const span of line.spans) {
        const first = symbolChain(span)?.[0];

        if (first !== undefined && removed.has(first)) named.add(first);
      }

      for (const name of named) found.push(`${doc}:${line.number}: names ${name}`);
    }
  }

  return found;
}

const base = process.argv[2] ?? "origin/main";

try {
  const found = impactSince(base);

  process.stdout.write(
    found.length === 0
      ? `No doc line names a path or an export that changed since ${base}.\n`
      : `${found.join("\n")}\n`,
  );
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);

  process.stderr.write(`docs:impact could not compare with ${base}: ${reason}\n`);
}
