import { memo } from "react";

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
  NO_RESULTS,
  RETRY_LABEL,
  SORT_LABEL,
  headLabel,
} from "./text.ts";

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

function ItemList({
  items,
  loadedAt,
  cardImages,
  openId,
  attention,
  attended,
  tryAgain,
  open,
  toggleRead,
}: Readonly<{
  items: readonly Item[];
  loadedAt: number;
  cardImages: boolean;
  openId: number | null;
  attention: Attention;
  attended: () => void;
  tryAgain: (item: Item) => void;
  open: (id: number) => void;
  toggleRead: (item: Item) => void;
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
            cardImages={cardImages}
            isOpen={item.id === openId}
            attention={item.id === attention?.id ? attention : null}
            attended={attended}
            tryAgain={tryAgain}
            open={open}
            toggleRead={toggleRead}
          />
        </li>
      ))}
    </ol>
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

interface ListBodyProps {
  readonly list: ListState;
  readonly cardImages: boolean;
  readonly openId: number | null;
  readonly attention: Attention;
  readonly attended: () => void;
  readonly retry: () => void;
  readonly tryAgain: (item: Item) => void;
  readonly clearAll: () => void;
  readonly open: (id: number) => void;
  readonly toggleRead: (item: Item) => void;
}

export const ListBody = memo(function ListBody({
  list,
  cardImages,
  openId,
  attention,
  attended,
  retry,
  tryAgain,
  clearAll,
  open,
  toggleRead,
}: Readonly<ListBodyProps>) {
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
    return <EmptyState heading={EMPTY_LIST.heading} line={EMPTY_LIST.line} />;
  }

  return (
    <ItemList
      items={list.items}
      loadedAt={list.loadedAt}
      cardImages={cardImages}
      openId={openId}
      attention={attention}
      attended={attended}
      tryAgain={tryAgain}
      open={open}
      toggleRead={toggleRead}
    />
  );
});
