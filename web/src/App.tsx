import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

import { itemIdOf } from "../../src/core/item-path.ts";
import type { SaveOutcome } from "./api.ts";
import { useBands } from "./bands.ts";
import { Icon } from "./Icon.tsx";
import { ItemRow } from "./ItemRow.tsx";
import { type ListState, useLibrary } from "./library.ts";
import { PasteBox } from "./PasteBox.tsx";
import { focusListStart, scrollToTop } from "./reveal.ts";
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

function ListBody({
  list,
  openId,
  retry,
}: Readonly<{ list: ListState; openId: number | null; retry: () => void }>) {
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
    <>
      <div className="list-head">
        <p className="results" aria-live="polite">
          {countLabel(list.items.length)}
        </p>
        <p className="label">{SORT_LABEL}</p>
      </div>
      {list.items.map((item) => (
        <ItemRow key={item.id} item={item} now={list.loadedAt} isOpen={item.id === openId} />
      ))}
    </>
  );
}

function useKeptPlace(list: ListState, retry: () => void, pane: RefObject<HTMLElement | null>) {
  const retried = useRef(false);

  const retryAndKeepPlace = useCallback(() => {
    retried.current = true;
    retry();
  }, [retry]);

  useEffect(() => {
    if (retried.current && list.status !== "loading" && pane.current !== null) {
      retried.current = false;
      focusListStart(pane.current);
    }
  }, [list.status, pane]);

  return retryAndKeepPlace;
}

export function App() {
  const root = useRef<HTMLDivElement>(null);
  const listPane = useRef<HTMLElement>(null);
  const bands = useBands(root);
  const { list, save, retry } = useLibrary();
  const [openId] = useState(() => itemIdOf(window.location.pathname));

  const saveAndShow = useCallback(
    async (url: string): Promise<SaveOutcome> => {
      const outcome = await save(url);

      if (outcome === "saved" && listPane.current !== null) {
        scrollToTop(listPane.current);
      }

      return outcome;
    },
    [save],
  );

  const retryAndKeepPlace = useKeptPlace(list, retry, listPane);

  const isEmpty = list.status === "ready" && list.items.length === 0;

  return (
    <div ref={root} className="app" data-layout="list" data-reader="pane" data-bp={bands}>
      <div className={isEmpty ? "lib is-empty" : "lib"}>
        <div className="bg">
          <header className="mast">
            <div className="brand">
              <h1>Threadsift</h1>
            </div>
            <PasteBox save={saveAndShow} />
          </header>
          <main ref={listPane} className="list" tabIndex={-1}>
            <ListBody list={list} openId={openId} retry={retryAndKeepPlace} />
          </main>
        </div>
      </div>
    </div>
  );
}
