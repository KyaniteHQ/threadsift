const decoder = new TextDecoder("latin1");

export class MalformedResponse extends Error {
  override readonly name = "MalformedResponse";
}

const CR = 13;

const LF = 10;

function concatenated(parts: readonly Uint8Array[]): Uint8Array {
  const all = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));

  parts.reduce((at, part) => {
    all.set(part, at);

    return at + part.length;
  }, 0);

  return all;
}

function lineEnd(bytes: Uint8Array): number {
  return bytes.findIndex((byte, at) => byte === CR && bytes[at + 1] === LF);
}

export interface ByteReader {
  readonly line: (limit: number) => Promise<string | null>;
  readonly take: (max: number) => Promise<Uint8Array | null>;
}

interface Terminator {
  readonly trimmed: number;
  readonly end: number;
  readonly resume: number;
}

function terminatorIn(heldEndsWithCr: boolean, data: Uint8Array): Terminator | null {
  if (heldEndsWithCr && data[0] === LF) return { trimmed: 1, end: 0, resume: 1 };

  const end = lineEnd(data);

  return end < 0 ? null : { trimmed: 0, end, resume: end + 2 };
}

interface Queue {
  readonly next: () => Promise<Uint8Array | null>;
  readonly unread: (bytes: Uint8Array) => void;
  readonly take: (max: number) => Promise<Uint8Array | null>;
}

function queueOf(source: Readonly<AsyncIterable<Uint8Array>>): Queue {
  const chunks = source[Symbol.asyncIterator]();
  let rest: Uint8Array = new Uint8Array(0);

  const next = async (): Promise<Uint8Array | null> => {
    if (rest.length > 0) {
      const data = rest;

      rest = new Uint8Array(0);

      return data;
    }

    const pulled = await chunks.next();

    if (pulled.done === true) return null;

    return pulled.value.length === 0 ? next() : pulled.value;
  };

  const unread = (bytes: Uint8Array): void => {
    rest = bytes;
  };

  const take = async (max: number): Promise<Uint8Array | null> => {
    const data = await next();

    if (data === null) return null;

    const part = data.subarray(0, max);

    unread(data.subarray(part.length));

    return part;
  };

  return { next, unread, take };
}

export function byteReader(source: Readonly<AsyncIterable<Uint8Array>>): ByteReader {
  const queue = queueOf(source);
  const held: Uint8Array[] = [];
  let heldBytes = 0;

  const line = async (limit: number): Promise<string | null> => {
    const data = await queue.next();

    if (data === null) return null;

    const found = terminatorIn(held.at(-1)?.at(-1) === CR, data);

    if (found === null) {
      held.push(data);
      heldBytes += data.length;

      if (heldBytes - (data.at(-1) === CR ? 1 : 0) > limit) {
        throw new MalformedResponse("a line is too long");
      }

      return line(limit);
    }

    const bytes = heldBytes - found.trimmed + found.end;

    if (bytes > limit) throw new MalformedResponse("a line is too long");

    const text = decoder.decode(
      concatenated([...held, data.subarray(0, found.end)]).subarray(0, bytes),
    );

    held.length = 0;
    heldBytes = 0;
    queue.unread(data.subarray(found.resume));

    return text;
  };

  return { line, take: queue.take };
}
