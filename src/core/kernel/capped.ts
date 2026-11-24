import { joinedBytes } from "../contract/encoding.ts";

export interface Capped {
  readonly bytes: Uint8Array;
  readonly cut: boolean;
}

export async function readPrefix(
  body: AsyncIterable<Uint8Array>,
  maxBytes: number,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let size = 0;

  for await (const chunk of body) {
    const kept = chunk.subarray(0, maxBytes - size);
    chunks.push(kept);
    size += kept.length;

    if (size >= maxBytes) {
      break;
    }
  }

  return joinedBytes(chunks);
}

export async function readCapped(
  body: AsyncIterable<Uint8Array>,
  maxBytes: number,
): Promise<Capped> {
  const prefix = await readPrefix(body, maxBytes + 1);

  return { bytes: prefix.subarray(0, maxBytes), cut: prefix.length > maxBytes };
}

class Overflow extends Error {}

async function intake(
  body: AsyncIterable<Uint8Array>,
  take: (chunk: Uint8Array) => boolean,
): Promise<boolean> {
  try {
    for await (const chunk of body) {
      if (!take(chunk)) throw new Overflow();
    }
  } catch (error) {
    if (error instanceof Overflow) return false;

    throw error;
  }

  return true;
}

export async function readExactly(
  body: AsyncIterable<Uint8Array>,
  size: number,
): Promise<Uint8Array | null> {
  const bytes = new Uint8Array(size);
  let filled = 0;

  const fits = await intake(body, (chunk) => {
    if (filled + chunk.length > size) return false;

    bytes.set(chunk, filled);
    filled += chunk.length;

    return true;
  });

  return fits && filled === size ? bytes : null;
}

export async function readWithin(
  body: AsyncIterable<Uint8Array>,
  maxBytes: number,
): Promise<Uint8Array | null> {
  const chunks: Uint8Array[] = [];
  let held = 0;

  const fits = await intake(body, (chunk) => {
    held += chunk.length;
    chunks.push(chunk);

    return held <= maxBytes;
  });

  return fits ? joinedBytes(chunks) : null;
}
