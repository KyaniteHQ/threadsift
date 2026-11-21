import { catalogKey } from "../../src/core/contract/catalog-key.ts";
import { topicPath } from "../../src/core/contract/topic-path.ts";
import { InternalLink } from "./InternalLink.tsx";
import { TOPIC_PAGE, topicLinkLabel } from "./topic-text.ts";

export function TopicLink({ name }: Readonly<{ name: string }>) {
  return (
    <InternalLink
      className="rd-topic"
      to={topicPath(catalogKey(name))}
      aria-label={topicLinkLabel(name)}
    >
      <bdi dir="auto">{name}</bdi>
    </InternalLink>
  );
}

export function TopicPageLink({ topicKey }: Readonly<{ topicKey: string }>) {
  return (
    <InternalLink className="fl-link" to={topicPath(topicKey)}>
      {TOPIC_PAGE.openPage}
    </InternalLink>
  );
}
