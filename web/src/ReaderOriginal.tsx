import type { ItemDetail } from "../../src/core/contract/item-detail-wire.ts";
import type { Item } from "../../src/core/contract/item-wire.ts";
import { SECTION_TITLES } from "../../src/core/contract/reader-text.ts";
import { Comments } from "./Comments.tsx";
import { POST_KEY } from "./highlight-target.ts";
import { PostTextView } from "./post-text-module.ts";
import { FILL_NOTE, NO_POST_TEXT, NO_README, archiveNote } from "./reader-text.ts";
import { ReaderTokenRefused } from "./ReaderTokenRefused.tsx";
import { RepositoryBlock } from "./RepositoryBlock.tsx";
import { CARD_TITLES, waitTitle } from "./text.ts";

function waitsForThread(item: Readonly<Item>): boolean {
  return item.fillable && item.status !== "processing";
}

function missingTextNote(item: Readonly<Item>, hasLink: boolean): string | null {
  if (item.status === "processing")
    return item.wait === null ? CARD_TITLES.reading : waitTitle(item.wait);

  if (waitsForThread(item)) return null;

  if (item.kind === "github-repo" && item.fetch === "ok") return NO_README;

  return hasLink ? null : NO_POST_TEXT;
}

export function Original({
  item,
  detail,
  now,
}: Readonly<{ item: Item; detail: ItemDetail; now: number }>) {
  const text = detail.postText;
  const hasText = text !== null && text.trim() !== "";
  const note = hasText ? null : missingTextNote(item, detail.link !== null);

  return (
    <>
      <ReaderTokenRefused item={item} />
      {detail.repository === null ? null : (
        <RepositoryBlock item={item} repository={detail.repository} now={now} />
      )}
      {waitsForThread(item) ? <p className="rd-note">{FILL_NOTE}</p> : null}
      {detail.comments.archive === null ? null : (
        <p className="rd-note">{archiveNote(detail.comments.archive, now)}</p>
      )}
      {note === null ? null : <p className="rd-note">{note}</p>}
      {hasText ? (
        <section className="rd-orig">
          <h3 className="rd-h">{SECTION_TITLES[item.kind]}</h3>
          <PostTextView text={text} targetKey={POST_KEY} itemId={item.id} images={detail.images} />
        </section>
      ) : null}
      <Comments item={item} detail={detail} />
    </>
  );
}
