import { memo, useId } from "react";

import type { IndexTopic } from "../../src/core/contract/topic-index-contract.ts";
import { topicPath } from "../../src/core/contract/topic-path.ts";
import { InternalLink } from "./InternalLink.tsx";
import { itemsLabel, topicLinkLabel } from "./topic-text.ts";

export const IndexRow = memo(function IndexRow({ topic }: Readonly<{ topic: IndexTopic }>) {
  const lineId = useId();
  const { key, name, itemCount, overviewLine } = topic;

  return (
    <li>
      <article className="rl-row ix-it">
        <h2 className="rl-title">
          <InternalLink
            className="rl-open"
            to={topicPath(key)}
            aria-label={topicLinkLabel(name)}
            aria-describedby={overviewLine === null ? undefined : lineId}
          >
            <bdi dir="auto">{name}</bdi>
          </InternalLink>
        </h2>
        <p className="ix-count">{itemsLabel(itemCount)}</p>
        {overviewLine === null ? null : (
          <p id={lineId} className="rl-sum ix-line" dir="auto">
            {overviewLine}
          </p>
        )}
      </article>
    </li>
  );
});
