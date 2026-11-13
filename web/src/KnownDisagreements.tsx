import { useId } from "react";

import { itemPath } from "../../src/core/item-path.ts";
import type { TopicPage } from "../../src/core/topic-overview-contract.ts";
import { useNavigateLink } from "./routing.ts";
import { TOPIC_PAGE } from "./topic-text.ts";

type Disagreement = TopicPage["disagreements"][number];

type Side = Disagreement["items"][number];

function SideLink({ side, navigate }: Readonly<{ side: Side; navigate: (to: string) => void }>) {
  const to = itemPath(side.id);

  const open = useNavigateLink(navigate, to);

  return (
    <li>
      <a className="tp-dis-link" href={to} onClick={open}>
        <bdi dir="auto">{side.title}</bdi>
      </a>
    </li>
  );
}

function Entry({
  disagreement,
  navigate,
}: Readonly<{ disagreement: Disagreement; navigate: (to: string) => void }>) {
  return (
    <li className="tp-dis">
      <p className="tp-line" dir="auto">
        {disagreement.reason}
      </p>
      <ul
        // oxlint-disable-next-line jsx-a11y/no-redundant-roles -- Safari drops list semantics from a ul with list-style none
        role="list"
        className="tp-dis-items"
        aria-label={TOPIC_PAGE.disagreementsEntryLabel}
      >
        {disagreement.items.map((side) => (
          <SideLink key={side.id} side={side} navigate={navigate} />
        ))}
      </ul>
    </li>
  );
}

export function KnownDisagreements({
  disagreements,
  navigate,
}: Readonly<{ disagreements: TopicPage["disagreements"]; navigate: (to: string) => void }>) {
  const headingId = useId();

  if (disagreements.length === 0) return null;

  return (
    <section className="rd-agent tp-disagreements" aria-labelledby={headingId}>
      <h2 id={headingId} className="label">
        {TOPIC_PAGE.disagreementsHeading}
      </h2>
      <ul
        // oxlint-disable-next-line jsx-a11y/no-redundant-roles -- Safari drops list semantics from a ul with list-style none
        role="list"
        className="tp-dis-list"
      >
        {disagreements.map((disagreement) => (
          <Entry key={disagreement.id} disagreement={disagreement} navigate={navigate} />
        ))}
      </ul>
    </section>
  );
}
