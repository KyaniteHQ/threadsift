import type { NetworkResponse, RequestHeaders } from "../../core/ports.ts";
import { redditRateLimitOf } from "../../core/reddit-session.ts";

const HEAD_LIMIT_BYTES = 16 * 1024;

const STATUS_LINE = /^HTTP\/1\.[01] (\d{3})(?: |$)/u;

const CHUNK_SIZE = /^([\da-f]{1,8})(?:;.*)?$/iu;

const NO_BODY_STATUSES: ReadonlySet<number> = new Set([204, 304]);

const IDENTITY = "identity";

const SWITCHING_PROTOCOLS = 101;

const encoder = new TextEncoder();

const decoder = new TextDecoder("latin1");

class MalformedResponse extends Error {
  override readonly name = "MalformedResponse";
}

export function requestBytes(host: string, path: string, headers: RequestHeaders): Uint8Array {
  const lines = Object.entries(headers).map(([name, value]) => `${name}: ${value}`);

  return encoder.encode(
    [`GET ${path} HTTP/1.1`, `host: ${host}`, ...lines, "connection: close", "", ""].join("\r\n"),
  );
}

function joined(first: Uint8Array, second: Uint8Array): Uint8Array {
  const both = new Uint8Array(first.length + second.length);

  both.set(first);
  both.set(second, first.length);

  return both;
}

function lineEnd(bytes: Uint8Array): number {
  return bytes.findIndex((byte, at) => byte === 13 && bytes[at + 1] === 10);
}

interface ByteReader {
  readonly line: (limit: number) => Promise<string | null>;
  readonly take: (max: number) => Promise<Uint8Array | null>;
}

function byteReader(source: Readonly<AsyncIterable<Uint8Array>>): ByteReader {
  const chunks = source[Symbol.asyncIterator]();
  let buffer: Uint8Array = new Uint8Array(0);

  const pull = async (): Promise<boolean> => {
    const next = await chunks.next();

    if (next.done === true) return false;

    buffer = buffer.length === 0 ? next.value : joined(buffer, next.value);

    return true;
  };

  const line = async (limit: number): Promise<string | null> => {
    const end = lineEnd(buffer);

    if (end >= 0) {
      const text = decoder.decode(buffer.subarray(0, end));

      buffer = buffer.subarray(end + 2);

      return text;
    }

    if (buffer.length > limit) throw new MalformedResponse("a line is too long");

    return (await pull()) ? line(limit) : null;
  };

  const take = async (max: number): Promise<Uint8Array | null> => {
    if (buffer.length === 0 && !(await pull())) return null;

    const part = buffer.subarray(0, max);

    buffer = buffer.subarray(part.length);

    return part;
  };

  return { line, take };
}

type HeaderMap = ReadonlyMap<string, string>;

async function headLines(
  reader: Readonly<ByteReader>,
  lines: readonly string[] = [],
): Promise<readonly string[]> {
  const line = await reader.line(HEAD_LIMIT_BYTES);

  if (line === null) throw new MalformedResponse("the head ended early");

  if (line === "") return lines;

  if (lines.join("").length + line.length > HEAD_LIMIT_BYTES) {
    throw new MalformedResponse("the head is too long");
  }

  return headLines(reader, [...lines, line]);
}

async function headersOf(reader: Readonly<ByteReader>): Promise<HeaderMap> {
  const headers = new Map<string, string>();

  for (const line of await headLines(reader)) {
    const colon = line.indexOf(":");

    if (colon < 1) throw new MalformedResponse("a header has no name");

    const name = line.slice(0, colon).toLowerCase();

    if (!headers.has(name)) headers.set(name, line.slice(colon + 1).trim());
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

async function finalHead(reader: Readonly<ByteReader>): Promise<Head> {
  const status = Number(STATUS_LINE.exec((await reader.line(HEAD_LIMIT_BYTES)) ?? "")?.[1]);

  if (!Number.isInteger(status)) throw new MalformedResponse("the status line is not readable");

  const headers = await headersOf(reader);

  return status >= 100 && status < 200 && status !== SWITCHING_PROTOCOLS
    ? finalHead(reader)
    : { status, headers };
}

export async function readResponse(
  source: Readonly<AsyncIterable<Uint8Array>>,
): Promise<NetworkResponse> {
  const reader = byteReader(source);
  const { status, headers } = await finalHead(reader);

  return {
    status,
    location: headers.get("location") ?? null,
    contentType: headers.get("content-type") ?? null,
    rateLimit: redditRateLimitOf((name) => headers.get(name) ?? null),
    body: bodyOf(reader, status, headers),
  };
}
