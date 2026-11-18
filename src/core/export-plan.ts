import type { CommentNode } from "./comment-view.ts";
import { parseFileKey } from "./file-keys.ts";
import type { readItem } from "./item-detail.ts";
import { itemNote, noteFileName } from "./item-note.ts";
import type { ZipFile } from "./zip.ts";

type NoteOptions = Parameters<typeof itemNote>[1];

const TEXT = new TextEncoder();

export interface StoredFile {
  readonly key: string;
  readonly size: number;
}

export interface Plan {
  readonly head: readonly ZipFile[];
  readonly stored: readonly StoredFile[];
}

export type Planned =
  | { readonly kind: "missing"; readonly key: string }
  | { readonly kind: "planned"; readonly plan: Plan };

type ReaderRead = NonNullable<Awaited<ReturnType<typeof readItem>>>;

type NotedItem = Readonly<
  Pick<
    ReaderRead["item"],
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

export interface PlanSource {
  readonly item: NotedItem;
  readonly keptNodes: readonly CommentNode[];
  readonly postTextKey: string | null;
  readonly storedFiles: readonly Readonly<{ key: string | null; size: number | null }>[];
}

export function ownedBy(itemId: number, key: string): boolean {
  return parseFileKey(key)?.itemId === String(itemId);
}

function noteTextOf(
  item: NotedItem,
  comments: readonly CommentNode[],
  options: NoteOptions,
): string {
  return itemNote(
    {
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
    },
    options,
  );
}

export function planOf(
  { item, keptNodes, postTextKey, storedFiles }: Readonly<PlanSource>,
  options: NoteOptions,
): Planned {
  const { id, postText } = item;

  if (postTextKey !== null && (postText === null || !ownedBy(id, postTextKey))) {
    return { kind: "missing", key: postTextKey };
  }

  const stored = storedFiles.flatMap(({ key, size }) =>
    key === null || size === null ? [] : [{ key, size }],
  );

  const foreign = stored.find(({ key }) => !ownedBy(id, key));

  if (foreign !== undefined) return { kind: "missing", key: foreign.key };

  const note = {
    name: `items/${String(id)}/${noteFileName(item.digestTitle ?? item.title)}`,
    bytes: TEXT.encode(noteTextOf(item, keptNodes, options)),
  };

  return {
    kind: "planned",
    plan: {
      head: [
        note,
        ...(postTextKey === null || postText === null
          ? []
          : [{ name: postTextKey, bytes: TEXT.encode(postText) }]),
      ],
      stored,
    },
  };
}
