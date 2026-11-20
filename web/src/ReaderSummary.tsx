import { KEY_POINTS_LABEL, SUMMARY_LABEL } from "../../src/core/contract/reader-text.ts";
import type { Item, ItemDetail } from "../../src/http/schemas.ts";
import { keyed } from "./keyed.ts";
import { tagHue } from "./tag-hue.ts";
import { TopicLink } from "./TopicLink.tsx";

export function ReaderSummary({
  item,
  digest,
}: Readonly<{ item: Item; digest: NonNullable<ItemDetail["digest"]> }>) {
  return (
    <aside className="rd-agent" aria-label={SUMMARY_LABEL}>
      <p className="rd-filed">
        {item.digestTopic === null ? null : <TopicLink name={item.digestTopic} />}
        <span className="tags">
          {keyed(digest.tags).map(({ key, text }) => (
            <span key={key} className="tag" data-tag={tagHue(text)}>
              <i className="tag-dot" />
              {text}
            </span>
          ))}
        </span>
      </p>
      <p className="rd-summary">{digest.summary}</p>
      <h3 className="label">{KEY_POINTS_LABEL}</h3>
      <ul role="list" className="rd-points">
        {keyed(digest.keyPoints).map(({ key, text }) => (
          <li key={key}>{text}</li>
        ))}
      </ul>
    </aside>
  );
}
