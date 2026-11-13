export type More = "idle" | "loading" | "failed";

interface Stamped {
  readonly id: number;
  readonly savedAt: number;
}

export function newer(left: Readonly<Stamped>, right: Readonly<Stamped>): boolean {
  return left.savedAt > right.savedAt || (left.savedAt === right.savedAt && left.id > right.id);
}
