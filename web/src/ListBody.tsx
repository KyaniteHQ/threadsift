import type { Item } from "../../src/http/schemas.ts";
import { Icon } from "./Icon.tsx";
import { ItemRow } from "./ItemRow.tsx";
import type { ListState } from "./library.ts";
import {
  EMPTY_LIST,
  LOADING_LABEL,
  LOAD_FAILED,
  RETRY_LABEL,
  SORT_LABEL,
  countLabel,
} from "./text.ts";

const SKELETON_ROWS = [0, 1, 2] as const;

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

export type Attention = Readonly<{ id: number }> | null;

function ItemList({
  items,
  loadedAt,
  openId,
  attention,
}: Readonly<{
  items: readonly Item[];
  loadedAt: number;
  openId: number | null;
  attention: Attention;
}>) {
  return (
    <>
      <div className="list-head">
        <p className="results" aria-live="polite">
          {countLabel(items.length)}
        </p>
        <p className="label">{SORT_LABEL}</p>
      </div>
      {items.map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          now={loadedAt}
          isOpen={item.id === openId}
          attention={item.id === attention?.id ? attention : null}
        />
      ))}
    </>
  );
}

export function ListBody({
  list,
  openId,
  attention,
  retry,
}: Readonly<{ list: ListState; openId: number | null; attention: Attention; retry: () => void }>) {
  if (list.status === "loading") {
    return <Loading />;
  }

  if (list.status === "failed") {
    return (
      <div className="noresults" role="alert">
        <p>{LOAD_FAILED}</p>
        <button type="button" className="btn" onClick={retry}>
          {RETRY_LABEL}
        </button>
      </div>
    );
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
    <ItemList items={list.items} loadedAt={list.loadedAt} openId={openId} attention={attention} />
  );
}
