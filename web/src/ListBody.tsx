import { type RefObject, memo, useEffect, useRef } from "react";

import type { Item } from "../../src/core/contract/item-wire.ts";
import { EmptyState } from "./EmptyState.tsx";
import { isEmptyResult } from "./filters.ts";
import { type Attention, ItemRow } from "./ItemRow.tsx";
import type { More } from "./list-paging.ts";
import type { ListState } from "./list-state.ts";
import { LoadMore } from "./LoadMore.tsx";
import { EMPTY_LIST, LOADING_LABEL, LOAD_FAILED } from "./text.ts";
import { useNearEnd } from "./use-near-end.ts";

const SKELETON_ROWS = [0, 1, 2] as const;
const EAGER_ROWS = 8;
export const RESULTS_ID = "results";

function Ghost({ row, line, title }: Readonly<{ row: string; line: string; title: string }>) {
  return (
    <div className={`${row} it-ghost`} aria-hidden="true">
      <div className={line}>
        <i />
      </div>
      <p className={title}>
        <i />
      </p>
    </div>
  );
}

export function Skeleton({
  label,
  row,
  title,
}: Readonly<{ label: string; row: string; title: string }>) {
  return (
    <>
      <output className="vh">{label}</output>
      {SKELETON_ROWS.map((at) => (
        <Ghost key={at} row={row} line="it-meta" title={title} />
      ))}
    </>
  );
}

function GhostItems() {
  return SKELETON_ROWS.map((at) => (
    <li key={at} aria-hidden="true">
      <Ghost row="it" line="it-strip" title="it-title" />
    </li>
  ));
}

function LoadingNote() {
  return <output className="vh">{LOADING_LABEL}</output>;
}

function Loading() {
  return (
    <>
      <LoadingNote />
      <ol className="items" aria-hidden="true">
        <GhostItems />
      </ol>
    </>
  );
}

export function Notice({
  text,
  action,
  label,
}: Readonly<{ text: string | null; action: () => void; label: string }>) {
  return (
    <div className="noresults">
      {text === null ? null : <p>{text}</p>}
      <button type="button" className="btn" onClick={action}>
        {label}
      </button>
    </div>
  );
}

export function ListHead({ label, sort }: Readonly<{ label: string; sort: string }>) {
  return (
    <section className="list-head">
      <p id={RESULTS_ID} className="results">
        {label}
      </p>
      <p className="label">{sort}</p>
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
  loadingMore,
  rows,
  shared,
}: Readonly<{
  items: readonly Item[];
  loadedAt: number;
  loadingMore: boolean;
  rows: RefObject<HTMLOListElement | null>;
  shared: Readonly<RowProps>;
}>) {
  return (
    <ol ref={rows} role="list" className="items" aria-labelledby={RESULTS_ID}>
      {items.map((item, index) => (
        <li key={item.id}>
          <ItemRow
            item={item}
            now={loadedAt}
            cardImages={shared.cardImages}
            eager={index < EAGER_ROWS}
            isOpen={item.id === shared.openId}
            attention={item.id === shared.attention?.id ? shared.attention : null}
            attended={shared.attended}
            tryAgain={shared.tryAgain}
            open={shared.open}
            toggleRead={shared.toggleRead}
          />
        </li>
      ))}
      {loadingMore ? <GhostItems /> : null}
    </ol>
  );
}

function MoreRows({ state, more }: Readonly<{ state: More; more: () => void }>) {
  return (
    <>
      {state === "loading" ? <LoadingNote /> : null}
      <LoadMore
        variant="column"
        more={state}
        failedText={LOAD_FAILED}
        disabled={state === "loading"}
        loadMore={more}
      />
    </>
  );
}

interface ListBodyProps extends RowProps {
  readonly list: ListState;
  readonly clearAll: () => void;
  readonly clearLabel: string;
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
  const loadingMore = list.next !== null && list.more === "loading";
  const bare = list.items.length === 0;

  useNearEnd(rows, list.items, waiting, more);

  useEffect(() => {
    if (bare && waiting) more();
  }, [bare, more, waiting]);

  return (
    <>
      {bare && !loadingMore ? null : (
        <ItemList
          items={list.items}
          loadedAt={list.loadedAt}
          loadingMore={loadingMore}
          rows={rows}
          shared={shared}
        />
      )}
      {list.next === null ? null : <MoreRows state={list.more} more={more} />}
    </>
  );
}

export const ListBody = memo(function ListBody({
  list,
  clearAll,
  clearLabel,
  more,
  ...shared
}: Readonly<ListBodyProps>) {
  if (list.status === "failed") return null;

  if (list.status === "loading") return <Loading />;

  const exhausted = isEmptyResult(list.items.length, list.next);

  if (exhausted && list.counts.total > 0) {
    return <Notice text={null} action={clearAll} label={clearLabel} />;
  }

  if (exhausted) {
    return <EmptyState place="library" heading={EMPTY_LIST.heading} line={EMPTY_LIST.line} />;
  }

  return <LoadedList list={list} more={more} shared={shared} />;
});
