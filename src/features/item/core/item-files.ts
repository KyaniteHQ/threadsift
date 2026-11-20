import type { CommentNode } from "../../../core/contract/comment-view.ts";
import { parseFileKey } from "../../../core/contract/file-keys.ts";
import type { ItemDetail } from "./item-detail.ts";
import type { ItemNoteInput } from "./item-note.ts";

type NotedItem = Readonly<
  Pick<
    ItemDetail,
    | "id"
    | "source"
    | "kind"
    | "originalUrl"
    | "author"
    | "community"
    | "postedAt"
    | "savedAt"
    | "fetchedAt"
    | "digestTopic"
    | "readState"
    | "digestTitle"
    | "title"
    | "digest"
    | "highlights"
    | "note"
    | "postText"
  >
>;

interface PlannedRead {
  readonly item: NotedItem;
  readonly keptNodes: () => readonly CommentNode[];
  readonly postTextKey: string | null;
  readonly storedFiles: readonly Readonly<{ key: string | null; size: number | null }>[];
}

export interface StoredFile {
  readonly key: string;
  readonly size: number;
}

export interface ItemFilePlan {
  readonly note: ItemNoteInput;
  readonly postText: Readonly<{ key: string; text: string }> | null;
  readonly stored: readonly StoredFile[];
}

type PlannedItemFiles =
  | { readonly kind: "missing"; readonly key: string }
  | { readonly kind: "planned"; readonly plan: ItemFilePlan };

function ownedBy(itemId: number, key: string): boolean {
  return parseFileKey(key)?.itemId === String(itemId);
}

function noteInputOf(item: PlannedRead["item"], comments: readonly CommentNode[]): ItemNoteInput {
  return {
    id: item.id,
    source: item.source,
    kind: item.kind,
    url: item.originalUrl,
    author: item.author,
    community: item.community,
    postedAt: item.postedAt,
    savedAt: item.savedAt,
    fetchedAt: item.fetchedAt,
    topic: item.digestTopic,
    tags: item.digest?.tags ?? [],
    readState: item.readState,
    title: item.digestTitle ?? item.title,
    summary: item.digest?.summary ?? null,
    keyPoints: item.digest?.keyPoints ?? [],
    highlights: item.highlights.items.map(({ selector, status }) => ({
      exact: selector.exact,
      found: status === "attached",
    })),
    note: item.note.body,
    postText: item.postText,
    comments,
  };
}

export function itemFilePlan({
  item,
  keptNodes,
  postTextKey,
  storedFiles,
}: Readonly<PlannedRead>): PlannedItemFiles {
  const { id, postText } = item;

  if (postTextKey !== null && (postText === null || !ownedBy(id, postTextKey))) {
    return { kind: "missing", key: postTextKey };
  }

  const stored = storedFiles.flatMap(({ key, size }) =>
    key === null || size === null ? [] : [{ key, size }],
  );

  const foreign = stored.find(({ key }) => !ownedBy(id, key));

  if (foreign !== undefined) return { kind: "missing", key: foreign.key };

  return {
    kind: "planned",
    plan: {
      note: noteInputOf(item, keptNodes()),
      postText:
        postTextKey === null || postText === null ? null : { key: postTextKey, text: postText },
      stored,
    },
  };
}
