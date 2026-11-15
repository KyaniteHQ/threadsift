import type { FileStore } from "./ports.ts";

export class ExportObjectMissing extends Error {}

type Controller = ReadableStreamDefaultController<Uint8Array>;

async function opened(
  files: Pick<FileStore, "get">,
  key: string,
): Promise<ReadableStream<Uint8Array>> {
  const body = await files.get(key);

  if (body === null) throw new ExportObjectMissing(`The export object ${key} is missing`);

  return body;
}

export function zipStream(
  files: Pick<FileStore, "get">,
  keys: readonly string[],
): ReadableStream<Uint8Array> {
  let next = 0;
  let cancelled = false;
  let current: ReadableStreamDefaultReader<Uint8Array> | null = null;

  const pull = async (controller: Readonly<Controller>): Promise<void> => {
    if (current === null) {
      const key = keys[next];

      if (key === undefined) {
        controller.close();

        return;
      }

      const body = await opened(files, key);

      if (cancelled) {
        await body.cancel();

        return;
      }

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
      cancelled = true;
      await current?.cancel(reason);
    },
  });
}
