import { useId } from "react";

import type { ItemDetail } from "../../src/core/contract/item-detail-wire.ts";
import { KEY_POINTS_LABEL, SUMMARY_LABEL } from "../../src/core/contract/reader-text.ts";
import { keyed } from "./keyed.ts";
import { tagHue } from "./tag-hue.ts";
import { TopicLink } from "./TopicLink.tsx";

export function ReaderFiled({
  topic,
  digest,
}: Readonly<{ topic: string | null; digest: ItemDetail["digest"] }>) {
  const tags = digest?.tags ?? [];
  if (topic === null && tags.length === 0) return null;

  return (
    <p className="rd-filed">
      {topic === null ? null : <TopicLink name={topic} />}
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

export function ReaderSummary({ digest }: Readonly<{ digest: NonNullable<ItemDetail["digest"]> }>) {
  const labelId = useId();

  return (
    <aside className="rd-agent" aria-labelledby={labelId}>
      <h3 id={labelId} className="label">
        {SUMMARY_LABEL}
      </h3>
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
