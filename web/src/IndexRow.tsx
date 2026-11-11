import { memo, useCallback, useId } from "react";

import type { IndexTopic } from "../../src/core/topic-index-contract.ts";
import { topicPath } from "../../src/core/topic-path.ts";
import { useInternalLink } from "./routing.ts";
import { itemsLabel, topicLinkLabel } from "./topic-text.ts";

export const IndexRow = memo(function IndexRow({
  topic,
  open,
}: Readonly<{ topic: IndexTopic; open: (key: string) => void }>) {
  const lineId = useId();
  const { key, name, itemCount, overviewLine } = topic;

  const follow = useInternalLink(
    useCallback(() => {
      open(key);
    }, [key, open]),
  );

  return (
    <li>
      <article className="tp-it ix-it">
        <h2 className="tp-title">
          <a
            className="tp-open"
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
          <p id={lineId} className="tp-sum ix-line" dir="auto">
            {overviewLine}
          </p>
        )}
      </article>
    </li>
  );
});
