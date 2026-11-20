import { utf8Length } from "../contract/encoding.ts";
import {
  ZipRefused,
  type ZipDirectory,
  type ZipEntry,
  type ZipSource,
  viewOf,
  wide,
  bytesAt,
  checkedEnd,
} from "./zip-read.ts";
import {
  CENTRAL_RECORD_BYTES,
  CENTRAL_SIGNATURE,
  END_BYTES,
  END_SIGNATURE,
  LOCAL_HEADER_BYTES,
  STORE_METHOD,
  ZIP_COUNT_LIMIT,
  ZIP_SIZE_LIMIT,
  ZIP64_END_BYTES,
  ZIP64_END_SIGNATURE,
  ZIP64_EXTRA_ID,
  ZIP64_LOCATOR_BYTES,
  ZIP64_LOCATOR_SIGNATURE,
  joined,
} from "./zip.ts";

const END_SEARCH_BYTES = 0xff_ff + END_BYTES;

const NAMES = new TextDecoder("utf-8", { fatal: true });

interface Placement {
  readonly count: number;
  readonly size: number;
  readonly offset: number;
}

async function zip64Placement(
  source: Readonly<ZipSource>,
  tail: Readonly<{ bytes: Uint8Array; end: number; start: number }>,
): Promise<Placement> {
  const at = tail.end - ZIP64_LOCATOR_BYTES;

  if (at < 0 || viewOf(tail.bytes).getUint32(at, true) !== ZIP64_LOCATOR_SIGNATURE) {
    throw new ZipRefused("malformed", "The zip has no ZIP64 locator");
  }

  const endAt = wide(viewOf(tail.bytes), at + 8);

  if (endAt + ZIP64_END_BYTES > source.size) {
    throw new ZipRefused("malformed", "The ZIP64 end record is outside the zip");
  }

  const record = viewOf(await bytesAt(source, endAt, ZIP64_END_BYTES));

  if (record.getUint32(0, true) !== ZIP64_END_SIGNATURE) {
    throw new ZipRefused("malformed", "The ZIP64 end record is malformed");
  }

  return { count: wide(record, 32), size: wide(record, 40), offset: wide(record, 48) };
}

async function placementOf(source: Readonly<ZipSource>): Promise<Placement> {
  if (source.size < END_BYTES) throw new ZipRefused("malformed", "The file is not a zip");

  const length = Math.min(source.size, END_SEARCH_BYTES);
  const start = source.size - length;
  const bytes = await bytesAt(source, start, length);
  const view = viewOf(bytes);

  for (let end = length - END_BYTES; end >= 0; end -= 1) {
    if (
      view.getUint32(end, true) === END_SIGNATURE &&
      end + END_BYTES + view.getUint16(end + 20, true) === length
    ) {
      const count = view.getUint16(end + 10, true);
      const size = view.getUint32(end + 12, true);
      const offset = view.getUint32(end + 16, true);

      return count === ZIP_COUNT_LIMIT || size === ZIP_SIZE_LIMIT || offset === ZIP_SIZE_LIMIT
        ? zip64Placement(source, { bytes, end, start })
        : { count, size, offset };
    }
  }

  throw new ZipRefused("malformed", "The file is not a zip");
}

function segmentsOf(name: string): string[] {
  const segments = name.split("/");

  if (segments.at(-1) === "") segments.pop();

  return segments;
}

function checkedName(name: string): void {
  const unsafe =
    name.startsWith("/") ||
    name.includes("\\") ||
    name.includes("\0") ||
    segmentsOf(name).some((segment) => segment === "" || segment === "." || segment === "..");

  if (name === "" || unsafe) {
    throw new ZipRefused("bad-name", "An entry of the zip has an unsafe name");
  }
}

interface Placeholders {
  readonly size: number;
  readonly packed: number;
  readonly headerOffset: number;
}

interface Located {
  readonly size: number;
  readonly headerOffset: number;
}

interface Zip64Fields {
  readonly size: number;
  readonly offset: number;
}

function zip64Fields(view: DataView, at: number, held: Readonly<Placeholders>): Zip64Fields {
  const wanted = [held.size, held.packed, held.headerOffset].filter(
    (value) => value === ZIP_SIZE_LIMIT,
  ).length;

  if (view.getUint16(at + 2, true) < wanted * 8 || at + 4 + wanted * 8 > view.byteLength) {
    throw new ZipRefused("malformed", "A ZIP64 extra field of the zip is too short");
  }

  const skipped = (held.size === ZIP_SIZE_LIMIT ? 8 : 0) + (held.packed === ZIP_SIZE_LIMIT ? 8 : 0);

  return { size: at + 4, offset: at + 4 + skipped };
}

function located(extra: Uint8Array, held: Readonly<Placeholders>): Located {
  const view = viewOf(extra);
  const found = { size: held.size, headerOffset: held.headerOffset };

  for (let at = 0; at + 4 <= extra.length; at += 4 + view.getUint16(at + 2, true)) {
    if (view.getUint16(at, true) === ZIP64_EXTRA_ID) {
      const wide64 = zip64Fields(view, at, held);

      if (held.size === ZIP_SIZE_LIMIT) found.size = wide(view, wide64.size);

      if (held.headerOffset === ZIP_SIZE_LIMIT) found.headerOffset = wide(view, wide64.offset);
    }
  }

  return found;
}

function decoded(bytes: Uint8Array): string {
  try {
    return NAMES.decode(bytes);
  } catch {
    throw new ZipRefused("bad-name", "An entry of the zip has a name that is not UTF-8");
  }
}

interface Parsed {
  readonly entries: readonly ZipEntry[];
  readonly rest: Uint8Array;
}

function parsedRecords(pending: Uint8Array): Parsed {
  const view = viewOf(pending);
  const entries: ZipEntry[] = [];
  let at = 0;

  while (at + CENTRAL_RECORD_BYTES <= pending.length) {
    if (view.getUint32(at, true) !== CENTRAL_SIGNATURE) {
      throw new ZipRefused("malformed", "The central directory is malformed");
    }

    const nameBytes = view.getUint16(at + 28, true);
    const extraBytes = view.getUint16(at + 30, true);
    const next = at + CENTRAL_RECORD_BYTES + nameBytes + extraBytes + view.getUint16(at + 32, true);

    if (next > pending.length) break;

    if (view.getUint16(at + 10, true) !== STORE_METHOD) {
      throw new ZipRefused("unsupported-method", "An entry of the zip is not stored");
    }

    const held = {
      packed: view.getUint32(at + 20, true),
      size: view.getUint32(at + 24, true),
      headerOffset: view.getUint32(at + 42, true),
    };

    if (held.packed !== held.size) {
      throw new ZipRefused("malformed", "An entry of the zip has two sizes");
    }

    const nameAt = at + CENTRAL_RECORD_BYTES;
    const name = decoded(pending.subarray(nameAt, nameAt + nameBytes));

    checkedName(name);
    entries.push({
      name,
      crc: view.getUint32(at + 16, true),
      ...located(pending.subarray(nameAt + nameBytes, nameAt + nameBytes + extraBytes), held),
    });
    at = next;
  }

  return { entries, rest: pending.subarray(at) };
}

async function recordsOf(
  source: Readonly<ZipSource>,
  { count, size, offset }: Readonly<Placement>,
): Promise<ZipEntry[]> {
  const entries: ZipEntry[] = [];
  let pending: Uint8Array = new Uint8Array(0);

  for await (const chunk of source.read(offset, size)) {
    pending = pending.length === 0 ? chunk : joined([pending, chunk]);

    const parsed = parsedRecords(pending);

    entries.push(...parsed.entries);
    pending = parsed.rest;
  }

  if (pending.length > 0 || entries.length !== count) {
    throw new ZipRefused("malformed", "The central directory does not match the end record");
  }

  return entries;
}

function sameRoot(entries: readonly ZipEntry[]): string {
  const roots = new Set(
    entries.map(({ name }) => (name.includes("/") ? (segmentsOf(name)[0] ?? "") : "")),
  );

  const [root] = roots;

  if (roots.size > 1 || root === "") {
    throw new ZipRefused("bad-name", "The entries of the zip do not share one root folder");
  }

  return root ?? "";
}

export async function readDirectory(
  source: Readonly<ZipSource>,
  directoryBytes: number,
): Promise<ZipDirectory> {
  const placement = await placementOf(source);

  if (placement.size > directoryBytes || placement.offset + placement.size > source.size) {
    throw new ZipRefused("malformed", "The central directory is outside the zip or too large");
  }

  const entries = await recordsOf(source, placement);

  if (new Set(entries.map(({ name }) => name)).size !== entries.length) {
    throw new ZipRefused("bad-name", "The zip holds two entries of one name");
  }

  for (const entry of entries) {
    checkedEnd(
      placement.offset,
      entry.headerOffset + LOCAL_HEADER_BYTES + utf8Length(entry.name),
      entry.size,
    );
  }

  return { entries, offset: placement.offset, root: entries.length === 0 ? "" : sameRoot(entries) };
}
