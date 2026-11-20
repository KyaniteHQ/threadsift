import type { ReaderDigest } from "../contract/digest-schema.ts";
import type { Database } from "../kernel/database.ts";
import { readStoredDigest } from "../kernel/digest-stored.ts";
import { logFailure } from "../kernel/failure-log.ts";
import type { Ports } from "../kernel/ports.ts";
import { sizedImagesOf } from "../media/media-reads.ts";
import { postTextOf } from "../thread/post-text.ts";
import { commentsOf, keptNodesOf } from "../thread/thread-read.ts";
import { detailReads } from "./detail-reads.ts";
import { highlightsViewOf } from "./highlights.ts";
import { noteViewOf } from "./notes.ts";

type DetailResults = Awaited<ReturnType<typeof detailReads>>;

function readerDigest(
  id: number,
  stored: string | undefined,
  tagRows: readonly Readonly<{ name: string }>[],
): ReaderDigest | null {
  if (stored === undefined) return null;

  const read = readStoredDigest(stored);

  if (read.kind === "unreadable") {
    logFailure("item-digest-unreadable", { itemId: id }, read.cause);

    return null;
  }

  const { summary, keyPoints } = read.digest;

  return { summary, keyPoints, tags: tagRows.map((tag) => tag.name) };
}

export async function readDetail<Extra extends readonly unknown[]>(
  { db, files }: Readonly<Pick<Ports, "db" | "files">>,
  id: number,
  read: (db: Database, id: number) => Promise<readonly [...DetailResults, ...Extra]>,
) {
  const [
    [row],
    [stored],
    tagRows,
    [repository],
    threadRows,
    threadReport,
    held,
    [note],
    sizes,
    related,
    ...extra
  ] = await read(db, id);

  if (row === undefined) return row;

  const { revision, postTextKey, topicId: _topicId, ...columns } = row;
  const postText = await postTextOf(files, id, { postText: columns.postText, postTextKey });
  const digest = { outcome: columns.digestOutcome, stored: stored !== undefined };

  return {
    row,
    extra,
    keptNodes: () => keptNodesOf(threadRows, threadReport, revision, digest),
    textLost: postText === null && postTextKey !== null,
    item: {
      ...columns,
      postText,
      digest: readerDigest(id, stored?.digest, tagRows),
      repository: repository ?? null,
      images: sizedImagesOf(sizes),
      comments: commentsOf(threadRows, threadReport, revision, digest),
      link: threadReport[0]?.link ?? null,
      highlights: highlightsViewOf(held, {
        post: revision,
        comments: threadReport[0]?.generation ?? null,
      }),
      note: noteViewOf(note),
      related,
    },
  };
}

export type ItemDetail = NonNullable<Awaited<ReturnType<typeof getItem>>>;

export async function getItem(ports: Readonly<Pick<Ports, "db" | "files">>, id: number) {
  const first = await readDetail(ports, id, detailReads);

  return first?.textLost === true ? (await readDetail(ports, id, detailReads))?.item : first?.item;
}
