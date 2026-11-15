import type { FileStore } from "./ports.ts";

export class ExportObjectMissing extends Error {}

export function zipStream(
  files: Pick<FileStore, "get">,
  keys: readonly string[],
): ReadableStream<Uint8Array> {
  let next = 0;
  let current: ReadableStreamDefaultReader<Uint8Array> | null = null;

  const pull = async (
    controller: Readonly<ReadableStreamDefaultController<Uint8Array>>,
  ): Promise<void> => {
    if (current === null) {
      const key = keys[next];

      if (key === undefined) {
        controller.close();

        return;
      }

      const body = await files.get(key);

      if (body === null) throw new ExportObjectMissing(`The export object ${key} is missing`);

      next += 1;
      current = body.getReader();
    }

    const { done, value } = await current.read();

    if (done) {
      current = null;

      return pull(controller);
    }

    controller.enqueue(value);
  };

  return new ReadableStream<Uint8Array>({
    pull,
    cancel: async (reason) => {
      await current?.cancel(reason);
    },
  });
}
