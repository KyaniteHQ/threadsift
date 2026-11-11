import { memo, useId } from "react";

import { itemPath } from "../../src/core/item-path.ts";
import type { TopicItem } from "../../src/core/topic-overview-contract.ts";
import { useNavigateLink } from "./routing.ts";
import { savedLabel } from "./saved-label.ts";
import { SOURCE_LABELS } from "./text.ts";
import { TOPIC_PAGE } from "./topic-text.ts";

export const TopicItemRow = memo(function TopicItemRow({
  item,
  now,
  flagged,
  navigate,
}: Readonly<{
  item: TopicItem;
  now: number;
  flagged: boolean;
  navigate: (to: string) => void;
}>) {
  const summaryId = useId();
  const to = itemPath(item.id);

  const open = useNavigateLink(navigate, to);

  return (
    <li>
      <article className="tp-it" data-read={item.read}>
        <p className="it-meta">
          <span className="src">{SOURCE_LABELS[item.source]}</span>
          <time className="it-date" dateTime={new Date(item.savedAt).toISOString()}>
            {savedLabel(item.savedAt, now)}
          </time>
        </p>
        <h2 className="tp-title">
          <a className="tp-open" href={to} aria-describedby={summaryId} onClick={open}>
            <bdi dir="auto">{item.title}</bdi>
          </a>
        </h2>
        <p id={summaryId} className="tp-sum" dir="auto">
          {item.summary}
        </p>
        {flagged ? <p className="label">{TOPIC_PAGE.notInOverview}</p> : null}
      </article>
    </li>
  );
});
