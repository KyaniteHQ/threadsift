import { memo, useId } from "react";

import { itemPath } from "../../src/core/contract/item-path.ts";
import type { Related as RelatedEntries } from "../../src/core/contract/related-contract.ts";
import { InternalLink } from "./InternalLink.tsx";
import { RELATED } from "./reader-text.ts";
import { SOURCE_LABELS } from "./text.ts";

const Entry = memo(function Entry({ entry }: Readonly<{ entry: RelatedEntries[number] }>) {
  const reasonId = useId();

  return (
    <li className="rel-entry">
      <p className="rel-src">{SOURCE_LABELS[entry.source]}</p>
      <InternalLink className="rel-link" to={itemPath(entry.id)} aria-describedby={reasonId}>
        <bdi dir="auto">{entry.title ?? RELATED.untitled}</bdi>
      </InternalLink>
      <p id={reasonId} className="rel-reason" dir="auto">
        {entry.reason}
      </p>
    </li>
  );
});

export function Related({ entries }: Readonly<{ entries: RelatedEntries }>) {
  if (entries.length === 0) return null;

  return (
    <section className="rel">
      <h3 className="rd-h">{RELATED.title}</h3>
      <ul role="list" className="rel-list">
        {entries.map((entry) => (
          <Entry key={entry.id} entry={entry} />
        ))}
      </ul>
    </section>
  );
}
