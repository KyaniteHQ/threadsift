import { type RefObject, memo, useEffect, useRef } from "react";

import type { FilterCounts } from "../../src/core/item-filters.ts";
import type { Item } from "../../src/http/schemas.ts";
import { type Filters, isFiltered, isSearching } from "./filters.ts";
import { Icon } from "./Icon.tsx";
import { type Attention, ItemRow } from "./ItemRow.tsx";
import type { ListState } from "./list-state.ts";
import {
  BLANK,
  CLEAR_ALL,
  EMPTY_LIST,
  LOADING_LABEL,
  LOAD_FAILED,
  LOAD_MORE,
  NO_RESULTS,
  RETRY_LABEL,
  SORT_LABEL,
  headLabel,
} from "./text.ts";
import { useNearEnd } from "./use-near-end.ts";

const SKELETON_ROWS = [0, 1, 2] as const;
export const RESULTS_ID = "results";

export function Skeleton({
  label,
  row,
  title,
}: Readonly<{ label: string; row: string; title: string }>) {
  return (
    <>
      <output className="vh">{label}</output>
      {SKELETON_ROWS.map((at) => (
        <div key={at} className={`${row} it-ghost`} aria-hidden="true">
          <p className="it-meta">
            <i />
          </p>
          <p className={title}>
            <i />
          </p>
        </div>
      ))}
    </>
  );
}

function Loading() {
  return <Skeleton label={LOADING_LABEL} row="it" title="it-title" />;
}

export function Notice({
  text,
  action,
  label,
  alert,
}: Readonly<{ text: string; action: () => void; label: string; alert: boolean }>) {
  return (
    <div className="noresults" role={alert ? "alert" : undefined}>
      <p>{text}</p>
      <button type="button" className="btn" onClick={action}>
        {label}
      </button>
    </div>
  );
}

export function ListHead({
  counts,
  shown,
  filters,
}: Readonly<{ counts: FilterCounts; shown: number; filters: Filters }>) {
  const text = isSearching(filters) ? filters.q.trim() : "";

  return (
    <section className="list-head" aria-labelledby={RESULTS_ID}>
      <p id={RESULTS_ID} className="results" aria-live="polite">
        {headLabel(counts, isFiltered(filters) ? shown : null, text)}
      </p>
      <p className="label">{SORT_LABEL}</p>
    </section>
  );
}

export function ListHeadGhost() {
  return (
    <section className="list-head" aria-hidden="true">
      <p className="results">{BLANK}</p>
      <p className="label">{BLANK}</p>
    </section>
  );
}

interface RowProps {
  readonly cardImages: boolean;
  readonly openId: number | null;
  readonly attention: Attention;
  readonly attended: () => void;
  readonly tryAgain: (item: Item) => void;
  readonly open: (id: number) => void;
  readonly toggleRead: (item: Item) => void;
}

function ItemList({
  items,
  loadedAt,
  rows,
  shared,
}: Readonly<{
  items: readonly Item[];
  loadedAt: number;
  rows: RefObject<HTMLOListElement | null>;
  shared: Readonly<RowProps>;
}>) {
  return (
    <ol
      ref={rows}
      // oxlint-disable-next-line jsx-a11y/no-redundant-roles -- Safari drops list semantics from an ol with list-style none
      role="list"
      className="items"
      aria-labelledby={RESULTS_ID}
    >
      {items.map((item) => (
        <li key={item.id}>
          <ItemRow
            item={item}
            now={loadedAt}
            cardImages={shared.cardImages}
            isOpen={item.id === shared.openId}
            attention={item.id === shared.attention?.id ? shared.attention : null}
            attended={shared.attended}
            tryAgain={shared.tryAgain}
            open={shared.open}
            toggleRead={shared.toggleRead}
          />
        </li>
      ))}
    </ol>
  );
}

function MoreRows({
  state,
  more,
}: Readonly<{ state: "idle" | "loading" | "failed"; more: () => void }>) {
  if (state === "failed") {
    return <Notice text={LOAD_FAILED} action={more} label={RETRY_LABEL} alert />;
  }

  return (
    <>
      {state === "loading" ? <Loading /> : null}
      <div className="noresults">
        <button type="button" className="btn" aria-disabled={state === "loading"} onClick={more}>
          {LOAD_MORE}
        </button>
      </div>
    </>
  );
}

export function EmptyState({ heading, line }: Readonly<{ heading: string; line: string }>) {
  return (
    <div className="empty">
      <Icon name="tray" className="ic ic-xl" />
      <h2>{heading}</h2>
      <p>{line}</p>
    </div>
  );
}

interface ListBodyProps extends RowProps {
  readonly list: ListState;
  readonly retry: () => void;
  readonly clearAll: () => void;
  readonly more: () => void;
}

function LoadedList({
  list,
  more,
  shared,
}: Readonly<{
  list: Extract<ListState, { readonly status: "ready" }>;
  more: ListBodyProps["more"];
  shared: Readonly<RowProps>;
}>) {
  const rows = useRef<HTMLOListElement>(null);

  const waiting = list.next !== null && list.more === "idle";
  const bare = list.items.length === 0;

  useNearEnd(rows, list.items, waiting, more);

  useEffect(() => {
    if (bare && waiting) more();
  }, [bare, more, waiting]);

  return (
    <>
      {bare ? null : (
        <ItemList items={list.items} loadedAt={list.loadedAt} rows={rows} shared={shared} />
      )}
      {list.next === null ? null : <MoreRows state={list.more} more={more} />}
    </>
  );
}

export const ListBody = memo(function ListBody({
  list,
  retry,
  clearAll,
  more,
  ...shared
}: Readonly<ListBodyProps>) {
  if (list.status === "loading") {
    return <Loading />;
  }

  if (list.status === "failed") {
    return <Notice text={LOAD_FAILED} action={retry} label={RETRY_LABEL} alert />;
  }

  const exhausted = list.items.length === 0 && list.next === null;

  if (exhausted && list.counts.total > 0) {
    return <Notice text={NO_RESULTS} action={clearAll} label={CLEAR_ALL} alert={false} />;
  }

  if (exhausted) {
    return <EmptyState heading={EMPTY_LIST.heading} line={EMPTY_LIST.line} />;
  }

  return <LoadedList list={list} more={more} shared={shared} />;
});
