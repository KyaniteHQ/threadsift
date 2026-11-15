import { readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

interface Scanned {
  readonly mtimeMs: number;
  readonly specifiers: readonly string[];
}

export interface ServerReach {
  readonly files: readonly string[];
  readonly module: string;
}

const STATEMENT_FROM =
  /(?:^|\n)\s*(?:import|export)\s+(type\s+)?([^;"']*?)\s*from\s+["']([^"']+)["']/gu;

const STATEMENT_BARE = /(?:^|\n)\s*import\s*["']([^"']+)["']/gu;

const DYNAMIC = /import\(\s*["']([^"']+)["']\s*\)/gu;

const SOURCE_FILE = /\.(?:ts|tsx|mts)$/u;

const scanned = new Map<string, Scanned>();

function isTypeOnlyList(names: string): boolean {
  const trimmed = names.trim();

  if (!trimmed.startsWith("{")) return false;

  const members = trimmed
    .slice(1, trimmed.lastIndexOf("}"))
    .split(",")
    .map((member) => member.trim())
    .filter((member) => member !== "");

  return members.every((member) => member.startsWith("type "));
}

export function valueSpecifiersOf(text: string): string[] {
  const found: string[] = [];

  for (const [, typeOnly, names = "", specifier = ""] of text.matchAll(STATEMENT_FROM)) {
    if (typeOnly === undefined && !isTypeOnlyList(names)) found.push(specifier);
  }

  for (const pattern of [STATEMENT_BARE, DYNAMIC]) {
    for (const [, specifier = ""] of text.matchAll(pattern)) found.push(specifier);
  }

  return found;
}

function specifiersOf(file: string): readonly string[] {
  const { mtimeMs } = statSync(file);
  const known = scanned.get(file);

  if (known?.mtimeMs === mtimeMs) return known.specifiers;

  const specifiers = valueSpecifiersOf(readFileSync(file, "utf8"));

  scanned.set(file, { mtimeMs, specifiers });

  return specifiers;
}

function isSourceFile(path: string): boolean {
  try {
    return SOURCE_FILE.test(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

export function sourceFileOf(from: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;

  const target = resolve(dirname(from), specifier);

  return isSourceFile(target) ? target : null;
}

export function isForbidden(forbidden: readonly RegExp[], specifier: string): boolean {
  return forbidden.some((pattern) => pattern.test(specifier));
}

export function serverReach(start: string, forbidden: readonly RegExp[]): ServerReach | null {
  const parents = new Map<string, string | null>([[start, null]]);
  const queue = [start];

  for (const file of queue) {
    for (const specifier of specifiersOf(file)) {
      if (isForbidden(forbidden, specifier))
        return { files: pathTo(parents, file), module: specifier };

      const target = sourceFileOf(file, specifier);

      if (target !== null && !parents.has(target)) {
        parents.set(target, file);
        queue.push(target);
      }
    }
  }

  return null;
}

function pathTo(parents: ReadonlyMap<string, string | null>, end: string): string[] {
  const files: string[] = [];

  for (
    let at: string | null | undefined = end;
    at !== null && at !== undefined;
    at = parents.get(at)
  ) {
    files.unshift(at);
  }

  return files;
}
