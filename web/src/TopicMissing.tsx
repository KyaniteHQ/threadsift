import { INDEX_PAGE } from "./index-text.ts";
import { InternalLink } from "./InternalLink.tsx";
import { PageEmpty } from "./PageEmpty.tsx";
import { INDEX_PATH } from "./routing.ts";
import { TOPIC_PAGE } from "./topic-text.ts";

export function TopicMissing() {
  return (
    <PageEmpty heading={TOPIC_PAGE.notFoundHeading} line={TOPIC_PAGE.notFoundLine}>
      <InternalLink className="fl-link" to={INDEX_PATH}>
        {INDEX_PAGE.masthead}
      </InternalLink>
    </PageEmpty>
  );
}
