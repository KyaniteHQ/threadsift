import type { RequestHeaders, WireResponse } from "../../core/kernel/network.ts";
import { type ByteReader, MalformedResponse, byteReader } from "./http1-bytes.ts";

const HEAD_LIMIT_BYTES = 16 * 1024;

const STATUS_LINE = /^HTTP\/1\.[01] (\d{3})(?: |$)/u;

const CHUNK_SIZE = /^([\da-f]{1,8})(?:;.*)?$/iu;

const NO_BODY_STATUSES: ReadonlySet<number> = new Set([204, 304]);

const IDENTITY = "identity";

const SWITCHING_PROTOCOLS = 101;

const encoder = new TextEncoder();

export function requestBytes(host: string, path: string, headers: RequestHeaders): Uint8Array {
  const lines = Object.entries(headers).map(([name, value]) => `${name}: ${value}`);

  return encoder.encode(
    [`GET ${path} HTTP/1.1`, `host: ${host}`, ...lines, "connection: close", "", ""].join("\r\n"),
  );
}

type HeaderMap = ReadonlyMap<string, string>;

const LINE_BREAK_BYTES = 2;

type NextLine = () => Promise<string>;

function headLines(reader: Readonly<ByteReader>): NextLine {
  let left = HEAD_LIMIT_BYTES;

  return async () => {
    const line = await reader.line(left - LINE_BREAK_BYTES);

    if (line === null) throw new MalformedResponse("the head ended early");

    left -= line.length + LINE_BREAK_BYTES;

    return line;
  };
}

async function headersOf(nextLine: NextLine): Promise<HeaderMap> {
  const headers = new Map<string, string>();
  let line = await nextLine();

  while (line !== "") {
    const colon = line.indexOf(":");

    if (colon < 1) throw new MalformedResponse("a header has no name");

    const name = line.slice(0, colon).toLowerCase();

    if (!headers.has(name)) headers.set(name, line.slice(colon + 1).trim());

    // oxlint-disable-next-line eslint/no-await-in-loop -- the head lines are read in order.
    line = await nextLine();
  }

  return headers;
}

async function* untilClose(reader: Readonly<ByteReader>): AsyncGenerator<Uint8Array> {
  let part = await reader.take(Infinity);

  while (part !== null) {
    yield part;

    // oxlint-disable-next-line eslint/no-await-in-loop -- the body is read in order.
    part = await reader.take(Infinity);
  }
}

async function* byLength(reader: Readonly<ByteReader>, length: number): AsyncGenerator<Uint8Array> {
  let left = length;

  while (left > 0) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- the body is read in order.
    const part = await reader.take(left);

    if (part === null) throw new MalformedResponse("the body ended early");

    left -= part.length;

    yield part;
  }
}

async function chunkSizeOf(reader: Readonly<ByteReader>): Promise<number> {
  const line = await reader.line(HEAD_LIMIT_BYTES);
  const size = CHUNK_SIZE.exec(line ?? "")?.[1];

  if (size === undefined) throw new MalformedResponse("a chunk size is not readable");

  return Number.parseInt(size, 16);
}

async function skipTrailers(reader: Readonly<ByteReader>): Promise<void> {
  const line = await reader.line(HEAD_LIMIT_BYTES);

  if (line === null) throw new MalformedResponse("the trailer ended early");

  if (line !== "") await skipTrailers(reader);
}

async function* chunked(reader: Readonly<ByteReader>): AsyncGenerator<Uint8Array> {
  let size = await chunkSizeOf(reader);

  while (size > 0) {
    yield* byLength(reader, size);

    // oxlint-disable-next-line eslint/no-await-in-loop -- each chunk ends with its own line break.
    if ((await reader.line(2)) !== "") throw new MalformedResponse("a chunk has no line break");

    // oxlint-disable-next-line eslint/no-await-in-loop -- the chunks are read in order.
    size = await chunkSizeOf(reader);
  }

  await skipTrailers(reader);
}

function bodyOf(
  reader: Readonly<ByteReader>,
  status: number,
  headers: Readonly<HeaderMap>,
): AsyncGenerator<Uint8Array> {
  const encoding = headers.get("content-encoding")?.toLowerCase() ?? IDENTITY;

  if (encoding !== IDENTITY) throw new MalformedResponse("the body is encoded");

  if (NO_BODY_STATUSES.has(status)) return byLength(reader, 0);

  if (headers.get("transfer-encoding")?.toLowerCase() === "chunked") return chunked(reader);

  const length = headers.get("content-length");

  if (length === undefined) return untilClose(reader);

  if (!/^\d+$/u.test(length)) throw new MalformedResponse("the length is not readable");

  return byLength(reader, Number(length));
}

interface Head {
  readonly status: number;
  readonly headers: HeaderMap;
}

async function finalHead(nextLine: NextLine): Promise<Head> {
  const status = Number(STATUS_LINE.exec(await nextLine())?.[1]);

  if (!Number.isInteger(status)) throw new MalformedResponse("the status line is not readable");

  const headers = await headersOf(nextLine);

  return status >= 100 && status < 200 && status !== SWITCHING_PROTOCOLS
    ? finalHead(nextLine)
    : { status, headers };
}

export async function readResponse(
  source: Readonly<AsyncIterable<Uint8Array>>,
): Promise<WireResponse> {
  const reader = byteReader(source);
  const { status, headers } = await finalHead(headLines(reader));

  return {
    status,
    header: (name) => headers.get(name) ?? null,
    body: bodyOf(reader, status, headers),
  };
}
