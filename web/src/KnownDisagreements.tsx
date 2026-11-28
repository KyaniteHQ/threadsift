import { itemPath } from "../../src/core/contract/item-path.ts";
import type { TopicPage } from "../../src/core/contract/topic-overview-contract.ts";
import { InternalLink } from "./InternalLink.tsx";
import { TOPIC_PAGE } from "./topic-text.ts";

type Disagreement = TopicPage["disagreements"][number];

type Side = Disagreement["items"][number];

function SideLink({ side }: Readonly<{ side: Side }>) {
  return (
    <li>
      <InternalLink className="tp-dis-link" to={itemPath(side.id)}>
        <bdi dir="auto">{side.title}</bdi>
      </InternalLink>
    </li>
  );
}

function Entry({ disagreement }: Readonly<{ disagreement: Disagreement }>) {
  return (
    <li className="tp-dis">
      <p className="tp-line" dir="auto">
        {disagreement.reason}
      </p>
      <ul role="list" className="tp-dis-items" aria-label={TOPIC_PAGE.disagreementsEntryLabel}>
        {disagreement.items.map((side) => (
          <SideLink key={side.id} side={side} />
        ))}
      </ul>
    </li>
  );
}

export function KnownDisagreements({
  disagreements,
}: Readonly<{ disagreements: TopicPage["disagreements"] }>) {
  if (disagreements.length === 0) return null;

  return (
    <section className="tp-box tp-disagreements">
      <h2 className="label">{TOPIC_PAGE.disagreementsHeading}</h2>
      <ul role="list" className="tp-dis-list">
        {disagreements.map((disagreement) => (
          <Entry key={disagreement.id} disagreement={disagreement} />
        ))}
      </ul>
    </section>
  );
}
