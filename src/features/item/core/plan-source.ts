import type { Ports } from "../../../core/kernel/ports.ts";
import { planReads } from "./detail-reads.ts";
import { readDetail } from "./item-detail.ts";
import { itemFilePlan } from "./item-files.ts";

async function readPlanSource(ports: Readonly<Pick<Ports, "db" | "files">>, id: number) {
  const detail = await readDetail(ports, id, planReads);

  if (detail === undefined) return detail;

  const {
    item,
    row,
    keptNodes,
    extra: [storedFiles],
  } = detail;

  return { item, keptNodes, postTextKey: row.postTextKey, storedFiles, topicId: row.topicId };
}

export async function readPlannedItem(ports: Readonly<Pick<Ports, "db" | "files">>, id: number) {
  const read = await readPlanSource(ports, id);

  return read === undefined ? null : { read, planned: itemFilePlan(read) };
}

export async function readAgainOnce<Result>(
  read: () => Promise<Result>,
  missed: (result: Result) => boolean,
  signal?: AbortSignal,
): Promise<Result> {
  const first = await read();

  if (!missed(first)) return first;

  signal?.throwIfAborted();

  return read();
}
