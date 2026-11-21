import { topicPath } from "../../src/core/contract/topic-path.ts";
import { InternalLink } from "./InternalLink.tsx";

export function TopicEffect({
  effect,
  topic,
}: Readonly<{
  effect: Readonly<{ before: string; after: string }>;
  topic: Readonly<{ key: string; name: string }>;
}>) {
  return (
    <h3 className="rl-title pr-effect">
      {effect.before}
      <InternalLink className="pr-place" to={topicPath(topic.key)}>
        <bdi dir="auto">{topic.name}</bdi>
      </InternalLink>
      {effect.after}
    </h3>
  );
}
