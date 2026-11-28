import type { ItemDetail } from "../../src/core/contract/item-detail-wire.ts";
import type { Item } from "../../src/core/contract/item-wire.ts";
import { SECTION_TITLES } from "../../src/core/contract/reader-text.ts";
import { Comments } from "./Comments.tsx";
import { POST_KEY } from "./highlight-target.ts";
import { PostTextView } from "./post-text-module.ts";
import { type SectionIds, postTextOf } from "./reader-sections.ts";
import { FILL_NOTE, NO_POST_TEXT, NO_README, archiveNote } from "./reader-text.ts";
import { ReaderTokenRefused } from "./ReaderTokenRefused.tsx";
import { Related } from "./Related.tsx";
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
  ids,
}: Readonly<{ item: Item; detail: ItemDetail; now: number; ids: SectionIds }>) {
  const text = postTextOf(detail);
  const note = text === null ? missingTextNote(item, detail.link !== null) : null;

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
      {text === null ? null : (
        <section id={ids.post} className="rd-orig">
          <h3 className="rd-h" tabIndex={-1}>
            {SECTION_TITLES[item.kind]}
          </h3>
          <PostTextView text={text} targetKey={POST_KEY} itemId={item.id} images={detail.images} />
        </section>
      )}
      <Related entries={detail.related} id={ids.related} />
      <Comments item={item} detail={detail} id={ids.comments} />
    </>
  );
}
