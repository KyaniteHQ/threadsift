import type { Item, ItemDetail } from "../../src/http/schemas.ts";
import { Comments } from "./Comments.tsx";
import { POST_KEY } from "./highlight-target.ts";
import { PostTextView } from "./post-text-module.ts";
import { PostTextBoundary } from "./PostTextBoundary.tsx";
import { NO_POST_TEXT, NO_README, SECTION_TITLES } from "./reader-text.ts";
import { RepositoryBlock } from "./RepositoryBlock.tsx";
import { SETTINGS_PATH } from "./routing.ts";
import { CARD_TITLES, TOKEN_REFUSED, WAITING } from "./text.ts";

function missingTextNote(item: Readonly<Item>): string {
  if (item.status === "processing") return item.wait === null ? CARD_TITLES.reading : WAITING.title;

  return item.kind === "github-repo" && item.fetch === "ok" ? NO_README : NO_POST_TEXT;
}

function TokenRefused({ text }: Readonly<{ text: string }>) {
  return (
    <>
      <p className="rd-note">{text}</p>
      <a className="btn" href={SETTINGS_PATH}>
        {TOKEN_REFUSED.link}
      </a>
    </>
  );
}

export function Original({
  item,
  detail,
  now,
}: Readonly<{ item: Item; detail: ItemDetail; now: number }>) {
  const text = detail.postText;

  return (
    <>
      {item.status === "ready" && item.fetch === "github-token" ? (
        <TokenRefused text={TOKEN_REFUSED.reader} />
      ) : null}
      {detail.repository === null ? null : (
        <RepositoryBlock item={item} repository={detail.repository} now={now} />
      )}
      <PostTextBoundary>
        {text === null || text.trim() === "" ? (
          <p className="rd-note">{missingTextNote(item)}</p>
        ) : (
          <section className="rd-orig">
            <h3 className="rd-h">{SECTION_TITLES[item.kind]}</h3>
            <PostTextView
              text={text}
              targetKey={POST_KEY}
              itemId={item.kind === "article" ? item.id : null}
              images={detail.images}
            />
          </section>
        )}
        <Comments item={item} detail={detail} />
      </PostTextBoundary>
    </>
  );
}
