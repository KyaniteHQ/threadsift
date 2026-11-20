import { type ThreadRefusal, refuse, refusing } from "../contract/thread-refusal.ts";
import { isPlainCodeDrop } from "./comment-filter.ts";
import { MAX_ROW_BYTES, type ThreadNode, moreNode, rowFits } from "./thread-rows.ts";

export interface ParsedThread {
  readonly title: string;
  readonly author: string | null;
  readonly community: string | null;
  readonly postText: string | null;
  readonly postedAt: number | null;
  readonly reported: number | null;
  readonly linkedUrl: string | null;
  readonly postLink: string | null;
  readonly nodes: readonly ThreadNode[];
}

export type ThreadParse =
  | { readonly kind: "thread"; readonly thread: ParsedThread }
  | ThreadRefusal;

interface CommentEntry {
  readonly kind: "comment";
  readonly id: string;
  readonly parentId: string | null;
  readonly depth: number;
  readonly author: string;
  readonly body: string;
  readonly score: number | null;
  readonly postedAt: number | null;
}

interface MoreEntry {
  readonly kind: "more";
  readonly parentId: string | null;
  readonly depth: number;
}

export type NodeEntry = CommentEntry | MoreEntry;

export function parsing<Thread>(
  read: () => Thread,
): { readonly kind: "thread"; readonly thread: Thread } | ThreadRefusal {
  const parsed = refusing(read);

  return parsed.kind === "read" ? { kind: "thread", thread: parsed.value } : parsed;
}

function nodeOf(
  entry: Readonly<NodeEntry>,
  position: number,
  named: (id: string) => string,
): ThreadNode {
  if (entry.kind === "more") return moreNode(position, entry.parentId, entry.depth);

  const eligible = !isPlainCodeDrop(entry.author, entry.body);

  const node: ThreadNode = {
    id: entry.id,
    parentId: entry.parentId,
    position,
    depth: entry.depth,
    kind: "comment",
    author: entry.author,
    body: eligible ? entry.body : null,
    score: entry.score,
    postedAt: entry.postedAt,
    eligible,
  };

  if (!rowFits(node)) {
    refuse(
      `the stored row of ${named(entry.id)} is longer than ${String(MAX_ROW_BYTES)} bytes once escaped`,
    );
  }

  return node;
}

export function threadNodesOf(
  entries: readonly NodeEntry[],
  named: (id: string) => string,
): readonly ThreadNode[] {
  return entries.map((entry, position) => nodeOf(entry, position, named));
}
