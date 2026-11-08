export interface Capped {
  readonly bytes: Uint8Array;
  readonly cut: boolean;
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

  const bytes = new Uint8Array(size);
  let at = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }

  return { bytes, cut };
}
