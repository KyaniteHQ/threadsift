import { fetchItem } from "./api.ts";

type Answer = Awaited<ReturnType<typeof fetchItem>>;

export interface ItemRead {
  readonly answer: Answer;
  readonly startedAt: number;
}

const queues = new Map<number, Promise<void>>();

function nothing(): void {}

export function readStatus(id: number, proceed: () => boolean): Promise<ItemRead | null> {
  const previous = queues.get(id) ?? Promise.resolve();

  const read = previous.then(async (): Promise<ItemRead | null> => {
    if (!proceed()) return null;

    const startedAt = performance.now();

    return { answer: await fetchItem(id), startedAt };
  });

  const settled = read.then(nothing, nothing);

  queues.set(id, settled);

  void settled.finally(() => {
    if (queues.get(id) === settled) queues.delete(id);
  });

  return read;
}

export async function lookUp(id: number): Promise<Answer | "failed"> {
  try {
    return (await readStatus(id, () => true))?.answer ?? "failed";
  } catch {
    return "failed";
  }
}
