import { type CatalogKind, TAG_KIND, TOPIC_KIND } from "./catalog-key-links.ts";
import type { MergeRow, PlanUnit } from "./merge-unit.ts";
import { planTagUnit } from "./tag-merge-unit.ts";
import { planTopicUnit } from "./topic-merge-unit.ts";

export const MERGES = {
  "tag-merge": { catalog: TAG_KIND, plan: planTagUnit },
  "topic-merge": { catalog: TOPIC_KIND, plan: planTopicUnit },
} as const satisfies Readonly<
  Record<MergeRow["kind"], { readonly catalog: CatalogKind; readonly plan: PlanUnit }>
>;
