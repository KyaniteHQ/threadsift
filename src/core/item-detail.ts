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
  tagNames: readonly string[],
): ReaderDigest | null {
  if (stored === undefined) return null;

  try {
    const { summary, keyPoints } = parseStoredDigest(stored);

    return { summary, keyPoints, tags: tagNames };
  } catch (error) {
    logFailure("item-digest-unreadable", { itemId: id }, error);

    return null;
  }
}

export async function getItem(ports: Readonly<Pick<Ports, "db" | "files">>, id: number) {
  const first = await readItem(ports, id);

  return first?.textLost === true ? (await readItem(ports, id))?.item : first?.item;
}

async function readItem({ db, files }: Readonly<Pick<Ports, "db" | "files">>, id: number) {
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
  ] = await detailReads(db, id);

  if (row === undefined) {
    return row;
  }

  const { revision, postTextKey, ...item } = row;
  const postText = await postTextOf(files, id, { postText: item.postText, postTextKey });

  return {
    textLost: postText === null && postTextKey !== null,
    item: {
      ...item,
      postText,
      digest: readerDigest(
        id,
        stored?.digest,
        tagRows.map((tag) => tag.name),
      ),
      repository: repository ?? null,
      images: sizedImagesOf(sizes),
      comments: commentsOf(threadRows, threadReport, revision),
      highlights: highlightsViewOf(held, {
        post: revision,
        comments: threadReport[0]?.generation ?? null,
      }),
      note: noteViewOf(note),
      related,
    },
  };
}
