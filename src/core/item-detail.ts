import { type ReaderDigest, parseStoredDigest } from "./ai-contract.ts";
import { detailReads } from "./detail-reads.ts";
import { logFailure } from "./failure-log.ts";
import { highlightsViewOf } from "./highlights.ts";
import { noteViewOf } from "./notes.ts";
import type { Ports } from "./ports.ts";
import { postTextOf, sizedImagesOf } from "./post-text.ts";
import { commentsOf } from "./thread-read.ts";

function readerDigest(
  id: number,
  stored: string | undefined,
  tagRows: readonly Readonly<{ name: string }>[],
): ReaderDigest | null {
  if (stored === undefined) return null;

  try {
    const { summary, keyPoints } = parseStoredDigest(stored);

    return { summary, keyPoints, tags: tagRows.map((tag) => tag.name) };
  } catch (error) {
    logFailure("item-digest-unreadable", { itemId: id }, error);

    return null;
  }
}

export async function getItem(ports: Readonly<Pick<Ports, "db" | "files">>, id: number) {
  const first = await readItem(ports, id);

  return first?.textLost === true ? (await readItem(ports, id))?.item : first?.item;
}

function commentViews(...args: Readonly<Parameters<typeof commentsOf>>) {
  const [rows, ...rest] = args;

  return {
    comments: commentsOf(rows, ...rest),
    keptNodes: () =>
      commentsOf(
        rows.map((row) => Object.assign({}, row, { readable: row.kept })),
        ...rest,
      ).nodes,
  };
}

export async function readItem({ db, files }: Readonly<Pick<Ports, "db" | "files">>, id: number) {
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
    storedFiles,
  ] = await detailReads(db, id);

  if (row === undefined) {
    return row;
  }

  const { revision, postTextKey, ...item } = row;
  const postText = await postTextOf(files, id, { postText: item.postText, postTextKey });

  const comments = commentViews(threadRows, threadReport, revision, {
    outcome: item.digestOutcome,
    stored: stored !== undefined,
  });

  return {
    textLost: postText === null && postTextKey !== null,
    postTextKey,
    storedFiles,
    keptNodes: comments.keptNodes,
    item: {
      ...item,
      postText,
      digest: readerDigest(id, stored?.digest, tagRows),
      repository: repository ?? null,
      images: sizedImagesOf(sizes),
      comments: comments.comments,
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
