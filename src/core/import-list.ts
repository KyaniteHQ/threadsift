import { webUrlOf } from "./addresses.ts";
import { hex } from "./encoding.ts";
import { BATCH_LINKS_MAX } from "./import-contract.ts";
import { BODY_LIMIT_BYTES } from "./limits.ts";
import { linkIn } from "./shared-link.ts";

const REDDIT_ORIGIN = "https://www.reddit.com";

const LINK_COLUMNS: ReadonlySet<string> = new Set(["permalink", "url"]);

const BYTE_ORDER_MARK = "\uFEFF";

const LINE_BREAK = /\r\n|\r|\n/gu;

const WHOLE_LINK = /^https?:\/\/\S+$/iu;

const RELATIVE_PERMALINK = /^\/(?!\/)/u;

const CSV_FIELD = /(?:"(?<quoted>(?:[^"]|"")*)"|(?<bare>[^,\r\n]*))(?<end>,|\r\n|\r|\n|$)/uy;

const NAME_PREFIX = "list-";

const NAME_DIGITS = 16;

const SKIPPED_SHOWN = 5;

const SKIPPED_TEXT_MAX = 120;

interface SkippedRow {
  readonly row: number;
  readonly text: string;
}

export interface Skipped {
  readonly count: number;
  readonly first: readonly SkippedRow[];
}

export type SkipReason = "noLink" | "tooLong";

export interface ImportList {
  readonly links: readonly string[];
  readonly skipped: Readonly<Record<SkipReason, Skipped>>;
}

export interface ImportRequest {
  readonly links: readonly { readonly url: string }[];
  readonly import: { readonly name: string; readonly cursor: string };
}

export type Resume =
  | { readonly kind: "fresh" }
  | { readonly kind: "partial"; readonly done: number }
  | { readonly kind: "complete" };

interface Entry {
  readonly row: number;
  readonly text: string;
  readonly address: URL | null;
}

interface CsvRecord {
  readonly line: number;
  readonly cells: readonly string[];
}

const encoder = new TextEncoder();

function bytesOf(value: Readonly<ImportRequest> | Readonly<{ url: string }>): number {
  return encoder.encode(JSON.stringify(value)).length;
}

function importRequest(links: readonly string[], name: string, cursor: number): ImportRequest {
  return { links: links.map((url) => ({ url })), import: { name, cursor: String(cursor) } };
}

const ENVELOPE_BYTES = bytesOf(
  importRequest([], `${NAME_PREFIX}${"0".repeat(NAME_DIGITS)}`, Number.MAX_SAFE_INTEGER),
);

function entryBytes(link: string): number {
  return bytesOf({ url: link }) + 1;
}

function fitsAlone(link: string): boolean {
  return ENVELOPE_BYTES + entryBytes(link) <= BODY_LIMIT_BYTES;
}

function* csvRecords(text: string): Generator<CsvRecord> {
  let cells: string[] = [];
  let position = 0;
  let line = 1;
  let startLine = 1;

  while (position < text.length) {
    CSV_FIELD.lastIndex = position;

    const found = CSV_FIELD.exec(text);
    const groups = found?.groups;

    if (found === null || groups === undefined) break;

    cells.push(groups["quoted"]?.replaceAll('""', '"') ?? groups["bare"] ?? "");
    position = CSV_FIELD.lastIndex;
    line += found[0].match(LINE_BREAK)?.length ?? 0;

    if (groups["end"] !== ",") {
      yield { line: startLine, cells };
      cells = [];
      startLine = line;
    }
  }

  if (cells.length > 0) yield { line: startLine, cells };
}

function proseAddress(field: string): URL | null {
  const found = linkIn(field);

  return found === undefined ? null : webUrlOf(found);
}

function addressOf(field: string): URL | null {
  const trimmed = field.trim();

  return WHOLE_LINK.test(trimmed) ? webUrlOf(trimmed) : proseAddress(trimmed);
}

function permalinkAddress(field: string): URL | null {
  const trimmed = field.trim();

  return RELATIVE_PERMALINK.test(trimmed) ? webUrlOf(trimmed, REDDIT_ORIGIN) : addressOf(trimmed);
}

function* lineEntries(text: string): Generator<Entry> {
  for (const [index, line] of text.split(LINE_BREAK).entries()) {
    if (line.trim() !== "") {
      yield { row: index + 1, text: line.trim(), address: addressOf(line) };
    }
  }
}

function isFilled(cells: readonly string[]): boolean {
  return cells.some((cell) => cell.trim() !== "");
}

function* columnEntries(text: string, column: number): Generator<Entry> {
  let afterHeader = false;

  for (const { line, cells } of csvRecords(text)) {
    if (isFilled(cells)) {
      if (afterHeader) {
        yield { row: line, text: cells.join(","), address: permalinkAddress(cells[column] ?? "") };
      }

      afterHeader = true;
    }
  }
}

function linkColumnOf(text: string): number {
  for (const { cells } of csvRecords(text)) {
    if (isFilled(cells)) {
      return cells.findIndex((cell) => LINK_COLUMNS.has(cell.trim().toLowerCase()));
    }
  }

  return -1;
}

function entriesOf(text: string): Generator<Entry> {
  const column = linkColumnOf(text);

  return column < 0 ? lineEntries(text) : columnEntries(text, column);
}

interface Tally {
  count: number;
  readonly first: SkippedRow[];
}

function emptyTally(): Tally {
  return { count: 0, first: [] };
}

type Verdict = { readonly link: string } | { readonly skip: SkipReason };

function verdictOf(address: URL | null): Verdict {
  if (address === null) return { skip: "noLink" };

  return fitsAlone(address.href) ? { link: address.href } : { skip: "tooLong" };
}

export function parseImportList(text: string): ImportList {
  const links = new Set<string>();

  const skipped = { noLink: emptyTally(), tooLong: emptyTally() };

  for (const entry of entriesOf(text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text)) {
    const verdict = verdictOf(entry.address);

    if ("link" in verdict) {
      links.add(verdict.link);
    } else {
      const tally = skipped[verdict.skip];

      tally.count += 1;

      if (tally.first.length < SKIPPED_SHOWN) {
        tally.first.push({ row: entry.row, text: entry.text.slice(0, SKIPPED_TEXT_MAX) });
      }
    }
  }

  return { links: [...links], skipped };
}

export async function importNameOf(links: readonly string[]): Promise<string> {
  const bytes = encoder.encode(links.join("\n"));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));

  return `${NAME_PREFIX}${hex(digest).slice(0, NAME_DIGITS)}`;
}

export function resumeOf(cursor: string | null, total: number): Resume {
  const done = cursor !== null && /^\d+$/u.test(cursor) ? Number(cursor) : 0;

  if (total > 0 && done >= total) return { kind: "complete" };

  return done > 0 ? { kind: "partial", done } : { kind: "fresh" };
}

export function nextBatch(links: readonly string[], from: number, name: string): ImportRequest {
  let end = from;
  let bytes = ENVELOPE_BYTES;

  while (end < links.length && end - from < BATCH_LINKS_MAX) {
    bytes += entryBytes(links[end] ?? "");

    if (bytes > BODY_LIMIT_BYTES && end > from) break;

    end += 1;
  }

  return importRequest(links.slice(from, end), name, end);
}
