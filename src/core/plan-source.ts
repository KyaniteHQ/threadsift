import { planReads } from "./detail-reads.ts";
import { readDetail } from "./item-detail.ts";
import type { Ports } from "./ports.ts";

export async function readPlanSource(ports: Readonly<Pick<Ports, "db" | "files">>, id: number) {
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
