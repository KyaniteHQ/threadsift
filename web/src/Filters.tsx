import { useCallback, useId, useState } from "react";

import type { FilterCounts } from "../../src/core/item-filters.ts";
import type { ReadState, Source } from "../../src/core/kinds.ts";
import { RowGroup, Segments, withAll } from "./FilterGroups.tsx";
import { type Choice, type Filters, chosenCount, isSearching } from "./filters.ts";
import { Icon } from "./Icon.tsx";
import {
  CLEAR_FILTERS,
  FILTERS_BUTTON,
  FILTERS_BUTTON_ACTIVE,
  FILTER_GROUPS,
  READ_LABELS,
  SOURCE_LABELS,
  filled,
} from "./text.ts";

type Choose = (choice: Choice) => void;

function FacetSegments<Key extends string>({
  name,
  wrap,
  counts,
  labels,
  chosen,
  pick,
}: Readonly<{
  name: string;
  wrap: boolean;
  counts: readonly { readonly key: Key; readonly count: number }[];
  labels: Readonly<Record<Key, string>>;
  chosen: Key | null;
  pick: (value: Key | null) => void;
}>) {
  return (
    <Segments
      name={name}
      wrap={wrap}
      chosen={chosen}
      segments={withAll(counts.map(({ key, count }) => ({ key, label: labels[key], count })))}
      pick={pick}
    />
  );
}

function SourceSegments({
  counts,
  chosen,
  choose,
}: Readonly<{ counts: FilterCounts; chosen: Source | null; choose: Choose }>) {
  const pick = useCallback(
    (value: Source | null) => {
      choose({ facet: "source", value });
    },
    [choose],
  );

  return (
    <FacetSegments
      name={FILTER_GROUPS.source}
      wrap
      counts={counts.sources}
      labels={SOURCE_LABELS}
      chosen={chosen}
      pick={pick}
    />
  );
}

function ReadSegments({
  counts,
  chosen,
  choose,
}: Readonly<{ counts: FilterCounts; chosen: ReadState | null; choose: Choose }>) {
  const pick = useCallback(
    (value: ReadState | null) => {
      choose({ facet: "read", value });
    },
    [choose],
  );

  return (
    <FacetSegments
      name={FILTER_GROUPS.read}
      wrap={false}
      counts={counts.reads}
      labels={READ_LABELS}
      chosen={chosen}
      pick={pick}
    />
  );
}

function NamedRows({
  facet,
  counts,
  filters,
  choose,
}: Readonly<{
  facet: "topic" | "tag";
  counts: FilterCounts;
  filters: Filters;
  choose: Choose;
}>) {
  const pick = useCallback(
    (value: string | null) => {
      choose({ facet, value });
    },
    [choose, facet],
  );

  return (
    <RowGroup
      facet={facet}
      rows={facet === "topic" ? counts.topics : counts.tags}
      chosen={filters[facet]}
      searching={isSearching(filters)}
      startsOpen={facet === "topic"}
      pick={pick}
    />
  );
}

function Panel({
  counts,
  filters,
  choose,
  clearChosen,
  id,
}: Readonly<{
  counts: FilterCounts;
  filters: Filters;
  choose: Choose;
  clearChosen: () => void;
  id: string;
}>) {
  return (
    <div id={id} className="fl-panel">
      <SourceSegments counts={counts} chosen={filters.source} choose={choose} />
      <ReadSegments counts={counts} chosen={filters.read} choose={choose} />
      <NamedRows facet="topic" counts={counts} filters={filters} choose={choose} />
      <NamedRows facet="tag" counts={counts} filters={filters} choose={choose} />
      {chosenCount(filters) > 0 ? (
        <button type="button" className="fl-link" onClick={clearChosen}>
          {CLEAR_FILTERS}
        </button>
      ) : null}
    </div>
  );
}

export function FilterPane({
  counts,
  filters,
  collapsible,
  choose,
  clearChosen,
}: Readonly<{
  counts: FilterCounts;
  filters: Filters;
  collapsible: boolean;
  choose: Choose;
  clearChosen: () => void;
}>) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const chosen = chosenCount(filters);

  const toggle = useCallback(() => {
    setExpanded((now) => !now);
  }, []);

  return (
    <div className="fl fl-rail">
      {collapsible ? (
        <button
          type="button"
          className="btn fl-toggle"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={toggle}
        >
          <Icon name="filters" className="ic ic-s" />
          {chosen === 0 ? FILTERS_BUTTON : filled(FILTERS_BUTTON_ACTIVE, { count: String(chosen) })}
        </button>
      ) : null}
      {collapsible && !expanded ? null : (
        <Panel
          counts={counts}
          filters={filters}
          choose={choose}
          clearChosen={clearChosen}
          id={panelId}
        />
      )}
    </div>
  );
}
