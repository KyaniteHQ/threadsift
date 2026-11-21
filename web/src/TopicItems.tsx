import { memo, useId } from "react";

import { itemPath } from "../../src/core/contract/item-path.ts";
import type { TopicItem } from "../../src/core/contract/topic-overview-contract.ts";
import { useNavigateLink } from "./navigate-context.ts";
import { SavedTime } from "./SavedTime.tsx";
import { READ_LABELS, SOURCE_LABELS } from "./text.ts";
import { TOPIC_PAGE } from "./topic-text.ts";

function TopicItemMeta({
  item,
  now,
  unreadId,
}: Readonly<{ item: TopicItem; now: number; unreadId: string }>) {
  return (
    <p className="it-meta">
      <i className="rl-dot" />
      {item.read ? null : (
        <span id={unreadId} className="vh" aria-hidden="true">
          {READ_LABELS.unread}
        </span>
      )}
      <span className="src">{SOURCE_LABELS[item.source]}</span>
      <SavedTime savedAt={item.savedAt} now={now} />
    </p>
  );
}

export const TopicItemRow = memo(function TopicItemRow({
  item,
  now,
  flagged,
}: Readonly<{
  item: TopicItem;
  now: number;
  flagged: boolean;
}>) {
  const base = useId();
  const summaryId = `${base}-sum`;
  const unreadId = `${base}-unread`;
  const to = itemPath(item.id);

  const open = useNavigateLink(to);

  return (
    <li>
      <article className="rl-row" data-read={item.read}>
        <TopicItemMeta item={item} now={now} unreadId={unreadId} />
        <h2 className="rl-title">
          <a
            className="rl-open"
            href={to}
            aria-describedby={item.read ? summaryId : `${unreadId} ${summaryId}`}
            onClick={open}
          >
            <bdi dir="auto">{item.title}</bdi>
          </a>
        </h2>
        <p id={summaryId} className="rl-sum" dir="auto">
          {item.summary}
        </p>
        {flagged ? <p className="label">{TOPIC_PAGE.notInOverview}</p> : null}
      </article>
    </li>
  );
});
