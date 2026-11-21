import { topicPath } from "../../src/core/contract/topic-path.ts";
import { useNavigateLink } from "./navigate-context.ts";

export function TopicEffect({
  effect,
  topic,
}: Readonly<{
  effect: Readonly<{ before: string; after: string }>;
  topic: Readonly<{ key: string; name: string }>;
}>) {
  const go = useNavigateLink(topicPath(topic.key));

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
