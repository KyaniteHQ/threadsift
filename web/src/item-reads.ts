import { NOTHING } from "../../src/core/contract/nothing.ts";
import { fetchItem } from "./api.ts";

export type ItemRead = Awaited<ReturnType<typeof fetchItem>>;

const queues = new Map<number, Promise<void>>();

function inQueue<Read>(id: number, run: () => Read | PromiseLike<Read>): Promise<Read> {
  const previous = queues.get(id) ?? Promise.resolve();
  const read = previous.then(run);

  const settled = read.then(NOTHING, NOTHING);

  queues.set(id, settled);

  void settled.finally(() => {
    if (queues.get(id) === settled) queues.delete(id);
  });

  return read;
}

export function readStatus(id: number, proceed: () => boolean): Promise<ItemRead | null> {
  return inQueue(id, () => (proceed() ? fetchItem(id) : null));
}

export async function lookUp(id: number): Promise<ItemRead | "failed"> {
  try {
    return await inQueue(id, () => fetchItem(id));
  } catch {
    return "failed";
  }
}
