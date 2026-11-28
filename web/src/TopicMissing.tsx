import { PlaceLink } from "./PlaceLink.tsx";
import { TOPIC_PAGE } from "./topic-text.ts";

export function TopicMissing() {
  return (
    <div className="pg-empty">
      <p>{TOPIC_PAGE.notFoundLine}</p>
      <PlaceLink to="index" />
    </div>
  );
}
