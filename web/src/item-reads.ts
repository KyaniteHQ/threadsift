import { NOTHING } from "../../src/core/contract/nothing.ts";
import { fetchItem } from "./api.ts";

export type ItemRead = Awaited<ReturnType<typeof fetchItem>>;

const queues = new Map<number, Promise<void>>();

export function readStatus(id: number, proceed: () => boolean): Promise<ItemRead | null> {
  const previous = queues.get(id) ?? Promise.resolve();

  const read = previous.then(() => {
    if (!proceed()) return null;

    return fetchItem(id);
  });

  const settled = read.then(NOTHING, NOTHING);

  queues.set(id, settled);

  void settled.finally(() => {
    if (queues.get(id) === settled) queues.delete(id);
  });

  return read;
}

export async function lookUp(id: number): Promise<ItemRead | "failed"> {
  try {
    return (await readStatus(id, () => true)) ?? "failed";
  } catch {
    return "failed";
  }
}
