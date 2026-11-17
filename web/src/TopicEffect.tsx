import { useCallback } from "react";

import { topicPath } from "../../src/core/topic-path.ts";
import { useInternalLink } from "./routing.ts";

export function TopicEffect({
  effect,
  topic,
  openTopic,
}: Readonly<{
  effect: Readonly<{ before: string; after: string }>;
  topic: Readonly<{ key: string; name: string }>;
  openTopic: (key: string) => void;
}>) {
  const go = useInternalLink(
    useCallback(() => {
      openTopic(topic.key);
    }, [openTopic, topic.key]),
  );

  return (
    <h3 className="rl-title pr-effect">
      {effect.before}
      <a className="pr-place" href={topicPath(topic.key)} onClick={go}>
        <bdi dir="auto">{topic.name}</bdi>
      </a>
      {effect.after}
    </h3>
  );
}
