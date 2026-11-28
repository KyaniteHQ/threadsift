import type { ItemDetail } from "../../src/core/contract/item-detail-wire.ts";
import type { Item } from "../../src/core/contract/item-wire.ts";
import { KEY_POINTS_LABEL, SUMMARY_LABEL } from "../../src/core/contract/reader-text.ts";
import { keyed } from "./keyed.ts";
import { tagHue } from "./tag-hue.ts";
import { TopicLink } from "./TopicLink.tsx";

type Digest = NonNullable<ItemDetail["digest"]>;

export function ReaderFiled({ item, digest }: Readonly<{ item: Item; digest: Digest | null }>) {
  const tags = digest?.tags ?? [];

  if (item.digestTopic === null && tags.length === 0) return null;

  return (
    <p className="rd-filed">
      {item.digestTopic === null ? null : <TopicLink name={item.digestTopic} />}
      {tags.length === 0 ? null : (
        <span className="tags">
          {keyed(tags).map(({ key, text }) => (
            <span key={key} className="tag" data-tag={tagHue(text)}>
              <i className="tag-dot" />
              {text}
            </span>
          ))}
        </span>
      )}
    </p>
  );
}

export function ReaderSummary({ digest, id }: Readonly<{ digest: Digest; id: string }>) {
  return (
    <section id={id} className="rd-digest">
      <h3 className="rd-h" tabIndex={-1}>
        {SUMMARY_LABEL}
      </h3>
      <p className="rd-summary">{digest.summary}</p>
      <h4 className="rd-sub">{KEY_POINTS_LABEL}</h4>
      <ul role="list" className="rd-points">
        {keyed(digest.keyPoints).map(({ key, text }) => (
          <li key={key}>{text}</li>
        ))}
      </ul>
    </section>
  );
}
