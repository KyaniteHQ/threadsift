import { memo } from "react";

import type { FilterCounts } from "../../src/core/item-filters.ts";
import type { Item } from "../../src/http/schemas.ts";
import { type Filters, isFiltered, isSearching } from "./filters.ts";
import { Icon } from "./Icon.tsx";
import { type Attention, ItemRow } from "./ItemRow.tsx";
import type { ListState } from "./library.ts";
import {
  CLEAR_ALL,
  EMPTY_LIST,
  LOADING_LABEL,
  LOAD_FAILED,
  NO_RESULTS,
  RETRY_LABEL,
  SORT_LABEL,
  headLabel,
} from "./text.ts";

const SKELETON_ROWS = [0, 1, 2] as const;
export const RESULTS_ID = "results";

function Loading() {
  return (
    <>
      <output className="vh">{LOADING_LABEL}</output>
      {SKELETON_ROWS.map((row) => (
        <div key={row} className="it it-ghost" aria-hidden="true">
          <p className="it-meta">
            <i />
          </p>
          <p className="it-title">
            <i />
          </p>
        </div>
      ))}
    </>
  );
}

function Notice({
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

function ItemList({
  items,
  loadedAt,
  openId,
  attention,
  tryAgain,
}: Readonly<{
  items: readonly Item[];
  loadedAt: number;
  openId: number | null;
  attention: Attention;
  tryAgain: (item: Item) => void;
}>) {
  return (
    <ol
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
            isOpen={item.id === openId}
            attention={item.id === attention?.id ? attention : null}
            tryAgain={tryAgain}
          />
        </li>
      ))}
    </ol>
  );
}

export const ListBody = memo(function ListBody({
  list,
  openId,
  attention,
  retry,
  tryAgain,
  clearAll,
}: Readonly<{
  list: ListState;
  openId: number | null;
  attention: Attention;
  retry: () => void;
  tryAgain: (item: Item) => void;
  clearAll: () => void;
}>) {
  if (list.status === "loading") {
    return <Loading />;
  }

  if (list.status === "failed") {
    return <Notice text={LOAD_FAILED} action={retry} label={RETRY_LABEL} alert />;
  }

  if (list.items.length === 0 && list.counts.total > 0) {
    return <Notice text={NO_RESULTS} action={clearAll} label={CLEAR_ALL} alert={false} />;
  }

  if (list.items.length === 0) {
    return (
      <div className="empty">
        <Icon name="tray" className="ic ic-xl" />
        <h2>{EMPTY_LIST.heading}</h2>
        <p>{EMPTY_LIST.line}</p>
      </div>
    );
  }

  return (
    <ItemList
      items={list.items}
      loadedAt={list.loadedAt}
      openId={openId}
      attention={attention}
      tryAgain={tryAgain}
    />
  );
});
