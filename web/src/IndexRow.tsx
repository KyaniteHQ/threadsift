import { memo, useId } from "react";

import type { IndexTopic } from "../../src/core/contract/topic-index-contract.ts";
import { topicPath } from "../../src/core/contract/topic-path.ts";
import { useNavigateLink } from "./navigate-context.ts";
import { itemsLabel, topicLinkLabel } from "./topic-text.ts";

export const IndexRow = memo(function IndexRow({ topic }: Readonly<{ topic: IndexTopic }>) {
  const lineId = useId();
  const { key, name, itemCount, overviewLine } = topic;
  const follow = useNavigateLink(topicPath(key));

  return (
    <li>
      <article className="rl-row ix-it">
        <h2 className="rl-title">
          <a
            className="rl-open"
            href={topicPath(key)}
            aria-label={topicLinkLabel(name)}
            aria-describedby={overviewLine === null ? undefined : lineId}
            onClick={follow}
          >
            <bdi dir="auto">{name}</bdi>
          </a>
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
