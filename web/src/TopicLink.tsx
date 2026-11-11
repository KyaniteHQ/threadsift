import { use, useCallback } from "react";

import { catalogKey } from "../../src/core/catalog.ts";
import { topicPath } from "../../src/core/topic-path.ts";
import { PagesScope } from "./pages-scope.ts";
import { useInternalLink } from "./routing.ts";
import { TOPIC_PAGE, topicLinkLabel } from "./topic-text.ts";

function useTopicLink(key: string) {
  const pages = use(PagesScope);

  const open = useInternalLink(
    useCallback(() => {
      pages?.topic(key);
    }, [key, pages]),
  );

  return pages === null ? null : { href: topicPath(key), open };
}

export function TopicLink({ name }: Readonly<{ name: string }>) {
  const link = useTopicLink(catalogKey(name));

  if (link === null) return <span className="rd-topic">{name}</span>;

  return (
    <a className="rd-topic" href={link.href} aria-label={topicLinkLabel(name)} onClick={link.open}>
      <bdi dir="auto">{name}</bdi>
    </a>
  );
}

export function TopicPageLink({ topicKey }: Readonly<{ topicKey: string }>) {
  const link = useTopicLink(topicKey);

  if (link === null) return null;

  return (
    <a className="fl-link" href={link.href} onClick={link.open}>
      {TOPIC_PAGE.openPage}
    </a>
  );
}
