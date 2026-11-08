import { use } from "react";

import type { Item, ItemDetail } from "../../src/http/schemas.ts";
import { postTextModule } from "./post-text-module.ts";
import { NO_POST_TEXT, NO_README, SECTION_TITLES } from "./reader-text.ts";
import { RepositoryBlock } from "./RepositoryBlock.tsx";
import { SETTINGS_PATH } from "./routing.ts";
import { CARD_TITLES, TOKEN_REFUSED } from "./text.ts";

function missingTextNote(item: Readonly<Item>): string {
  if (item.status === "processing") return CARD_TITLES.reading;

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
  const { PostText } = use(postTextModule());
  const text = detail.postText;

  return (
    <>
      {item.status !== "processing" && item.fetch === "github-token" ? (
        <TokenRefused text={TOKEN_REFUSED.reader} />
      ) : null}
      {detail.repository === null ? null : (
        <RepositoryBlock item={item} repository={detail.repository} now={now} />
      )}
      {text === null || text.trim() === "" ? (
        <p className="rd-note">{missingTextNote(item)}</p>
      ) : (
        <section className="rd-orig">
          <h3 className="rd-h">{SECTION_TITLES[item.kind]}</h3>
          <PostText text={text} />
        </section>
      )}
    </>
  );
}
