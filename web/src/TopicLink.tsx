import { catalogKey } from "../../src/core/contract/catalog-key.ts";
import { topicPath } from "../../src/core/contract/topic-path.ts";
import { useNavigateLink } from "./navigate-context.ts";
import { TOPIC_PAGE, topicLinkLabel } from "./topic-text.ts";

export function TopicLink({ name }: Readonly<{ name: string }>) {
  const href = topicPath(catalogKey(name));
  const open = useNavigateLink(href);

  return (
    <a className="rd-topic" href={href} aria-label={topicLinkLabel(name)} onClick={open}>
      <bdi dir="auto">{name}</bdi>
    </a>
  );
}

export function TopicPageLink({ topicKey }: Readonly<{ topicKey: string }>) {
  const href = topicPath(topicKey);
  const open = useNavigateLink(href);

  return (
    <a className="fl-link" href={href} onClick={open}>
      {TOPIC_PAGE.openPage}
    </a>
  );
}
