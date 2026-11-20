import type { SearchPartKind } from "./search-tables.ts";

type KindsWithoutGroup<Groups extends Readonly<Record<string, readonly SearchPartKind[]>>> =
  Exclude<SearchPartKind, Groups[keyof Groups][number]>;

function everyKindGrouped<const Groups extends Readonly<Record<string, readonly SearchPartKind[]>>>(
  groups: Groups & ([KindsWithoutGroup<Groups>] extends [never] ? unknown : never),
): Groups {
  return groups;
}

export const PART_GROUPS = everyKindGrouped({
  title: ["title"],
  postText: ["post-text"],
  digest: ["digest-title", "summary", "tags"],
  tags: ["tags"],
  comments: ["comment"],
  repository: ["repository"],
  highlights: ["highlight"],
  notes: ["note"],
});
