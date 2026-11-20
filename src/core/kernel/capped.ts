export interface Capped {
  readonly bytes: Uint8Array;
  readonly cut: boolean;
}

function joinedChunks(chunks: readonly Uint8Array[], size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  let at = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }

  return bytes;
}

export async function readCapped(
  body: AsyncIterable<Uint8Array>,
  maxBytes: number,
): Promise<Capped> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  let cut = false;

  for await (const chunk of body) {
    const room = maxBytes - size;
    cut = chunk.length > room;
    const kept = cut ? chunk.subarray(0, room) : chunk;
    chunks.push(kept);
    size += kept.length;

    if (cut) {
      break;
    }
  }

  return { bytes: joinedChunks(chunks, size), cut };
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

  return fits ? joinedChunks(chunks, held) : null;
}
