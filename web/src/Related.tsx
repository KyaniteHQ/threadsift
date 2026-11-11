import { memo, use, useCallback, useId } from "react";

import { itemPath } from "../../src/core/item-path.ts";
import type { Related as RelatedEntries } from "../../src/core/related-contract.ts";
import { PagesScope } from "./pages-scope.ts";
import { RELATED } from "./reader-text.ts";
import { useInternalLink } from "./routing.ts";
import { SOURCE_LABELS } from "./text.ts";

const Entry = memo(function Entry({ entry }: Readonly<{ entry: RelatedEntries[number] }>) {
  const pages = use(PagesScope);
  const reasonId = useId();

  const open = useInternalLink(
    useCallback(() => {
      pages?.item(entry.id);
    }, [pages, entry.id]),
  );

  return (
    <li className="rel-entry">
      <p className="rel-src">{SOURCE_LABELS[entry.source]}</p>
      <a className="rel-link" href={itemPath(entry.id)} aria-describedby={reasonId} onClick={open}>
        <bdi dir="auto">{entry.title ?? RELATED.untitled}</bdi>
      </a>
      <p id={reasonId} className="rel-reason" dir="auto">
        {entry.reason}
      </p>
    </li>
  );
});

export function Related({ entries }: Readonly<{ entries: RelatedEntries }>) {
  const heading = useId();

  if (entries.length === 0) return null;

  return (
    <section className="rel" aria-labelledby={heading}>
      <h3 id={heading} className="rd-h">
        {RELATED.title}
      </h3>
      <ul className="rel-list">
        {entries.map((entry) => (
          <Entry key={entry.id} entry={entry} />
        ))}
      </ul>
    </section>
  );
}
