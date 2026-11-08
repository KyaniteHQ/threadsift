import { useCallback, useId, useState } from "react";

import type { FilterCounts } from "../../src/core/item-filters.ts";
import type { ReadState, Source } from "../../src/core/kinds.ts";
import { NamedSelect, RowGroup, Segments, withAll } from "./FilterGroups.tsx";
import { type Choice, type Filters, chosenCount, isSearching } from "./filters.ts";
import { Icon } from "./Icon.tsx";
import {
  BLANK,
  CLEAR_FILTERS,
  FILTERS_BUTTON,
  FILTERS_BUTTON_ACTIVE,
  FILTER_GROUPS,
  READ_LABELS,
  SOURCE_LABELS,
  filled,
} from "./text.ts";

type Choose = (choice: Choice) => void;

const sourceChoice = (value: Source | null): Choice => ({ facet: "source", value });
const readChoice = (value: ReadState | null): Choice => ({ facet: "read", value });

function FacetSegments<Key extends string>({
  name,
  wrap,
  bar,
  counts,
  labels,
  chosen,
  choice,
  choose,
}: Readonly<{
  name: string;
  wrap: boolean;
  bar: boolean;
  counts: readonly { readonly key: Key; readonly count: number }[];
  labels: Readonly<Record<Key, string>>;
  chosen: Key | null;
  choice: (value: Key | null) => Choice;
  choose: Choose;
}>) {
  const pick = useCallback(
    (value: Key | null) => {
      choose(choice(value));
    },
    [choice, choose],
  );

  return (
    <Segments
      name={name}
      wrap={wrap}
      bar={bar}
      chosen={chosen}
      segments={withAll(counts.map(({ key, count }) => ({ key, label: labels[key], count })))}
      pick={pick}
    />
  );
}

function NamedRows({
  facet,
  bar,
  counts,
  filters,
  choose,
}: Readonly<{
  facet: "topic" | "tag";
  bar: boolean;
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

  const rows = facet === "topic" ? counts.topics : counts.tags;

  return bar ? (
    <NamedSelect
      facet={facet}
      rows={rows}
      chosen={filters[facet]}
      searching={isSearching(filters)}
      pick={pick}
    />
  ) : (
    <RowGroup
      facet={facet}
      rows={rows}
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
  bar,
  id,
}: Readonly<{
  counts: FilterCounts;
  filters: Filters;
  choose: Choose;
  clearChosen: () => void;
  bar: boolean;
  id: string;
}>) {
  return (
    <div id={id} className="fl-panel">
      <FacetSegments
        name={FILTER_GROUPS.source}
        wrap
        bar={bar}
        counts={counts.sources}
        labels={SOURCE_LABELS}
        chosen={filters.source}
        choice={sourceChoice}
        choose={choose}
      />
      <FacetSegments
        name={FILTER_GROUPS.read}
        wrap={false}
        bar={bar}
        counts={counts.reads}
        labels={READ_LABELS}
        chosen={filters.read}
        choice={readChoice}
        choose={choose}
      />
      <NamedRows facet="topic" bar={bar} counts={counts} filters={filters} choose={choose} />
      <NamedRows facet="tag" bar={bar} counts={counts} filters={filters} choose={choose} />
      {chosenCount(filters) > 0 ? (
        <button type="button" className="fl-link" onClick={clearChosen}>
          {CLEAR_FILTERS}
        </button>
      ) : null}
    </div>
  );
}

export function FilterGhost({
  collapsible,
  bar,
}: Readonly<{ collapsible: boolean; bar: boolean }>) {
  if (!collapsible && !bar) return null;

  return (
    <div className={bar ? "fl fl-bar" : "fl fl-rail"} aria-hidden="true" inert>
      {collapsible ? (
        <button type="button" className="btn fl-toggle" disabled>
          <Icon name="filters" className="ic ic-s" />
          {BLANK}
        </button>
      ) : (
        <div className="fl-panel">
          <div className="fl-g">
            <span className="fl-chip">{BLANK}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function FilterPane({
  counts,
  filters,
  collapsible,
  bar,
  choose,
  clearChosen,
}: Readonly<{
  counts: FilterCounts;
  filters: Filters;
  collapsible: boolean;
  bar: boolean;
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
    <div className={bar ? "fl fl-bar" : "fl fl-rail"}>
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
          bar={bar}
          id={panelId}
        />
      )}
    </div>
  );
}
