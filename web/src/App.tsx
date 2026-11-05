import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

import { itemIdOf } from "../../src/core/item-path.ts";
import { type SaveOutcome, type SaveResult, noticeOf } from "./api.ts";
import type { Attention } from "./ItemRow.tsx";
import { type ListState, useLibrary } from "./library.ts";
import { ListBody } from "./ListBody.tsx";
import { PasteBox } from "./PasteBox.tsx";
import { focusListStart, scrollToTop } from "./reveal.ts";
import { SettingsPanel } from "./SettingsPanel.tsx";
import { useRoot } from "./use-root.ts";

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

function useOpenItem(list: ListState) {
  const [openId] = useState(() => itemIdOf(window.location.pathname));

  const [attention, setAttention] = useState<Attention>(
    openId === null ? null : { id: openId, focus: true },
  );

  const missing =
    list.status === "ready" && openId !== null && !list.items.some((item) => item.id === openId);

  useEffect(() => {
    if (missing) {
      window.history.replaceState(null, "", "/");
    }
  }, [missing]);

  return { openId, attention, attend: setAttention };
}

function useSaveAndShow(
  save: (url: string) => Promise<SaveResult>,
  attend: (attention: Attention) => void,
  pane: RefObject<HTMLElement | null>,
) {
  return useCallback(
    async (url: string): Promise<SaveOutcome> => {
      const result = await save(url);

      if (result.outcome !== "saved") {
        return { saved: false, notice: result.outcome, focus: "field" };
      }

      const notice = noticeOf(result);
      const focusRow = result.known && notice === null;

      if (result.known) {
        attend({ id: result.item.id, focus: focusRow });
      } else if (pane.current !== null) {
        scrollToTop(pane.current);
      }

      return { saved: true, notice, focus: focusRow ? "row" : "field" };
    },
    [attend, pane, save],
  );
}

export function App() {
  const listPane = useRef<HTMLElement>(null);
  const { ref, attributes, narrow, settings, isDark, pick, reset } = useRoot();
  const { list, save, retry } = useLibrary();
  const { openId, attention, attend } = useOpenItem(list);

  const saveAndShow = useSaveAndShow(save, attend, listPane);

  const retryAndKeepPlace = useKeptPlace(list, retry, listPane);

  const isEmpty = list.status === "ready" && list.items.length === 0;

  return (
    <div ref={ref} className="app" {...attributes} data-reader="pane">
      <div className={isEmpty ? "lib is-empty" : "lib"}>
        <div className="bg">
          <header className="mast">
            <div className="brand">
              <h1>Threadsift</h1>
              <SettingsPanel
                settings={settings}
                isDark={isDark}
                modal={narrow}
                choose={pick}
                reset={reset}
              />
            </div>
            <PasteBox save={saveAndShow} />
          </header>
          <main ref={listPane} className="list" tabIndex={-1}>
            <ListBody list={list} openId={openId} attention={attention} retry={retryAndKeepPlace} />
          </main>
        </div>
      </div>
    </div>
  );
}
