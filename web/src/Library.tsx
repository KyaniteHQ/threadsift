import { useRef } from "react";

import { knownItems, useLibrary } from "./library.ts";
import { ListBody } from "./ListBody.tsx";
import { PasteBox } from "./PasteBox.tsx";
import type { Route } from "./routing.ts";
import { SettingsPanel } from "./SettingsPanel.tsx";
import { useListActions } from "./use-list-actions.ts";
import type { Look } from "./use-root.ts";

export function Library({
  look,
  arrived,
  route,
  openSettings,
}: Readonly<{ look: Look; arrived: boolean; route: Route; openSettings: () => void }>) {
  const listPane = useRef<HTMLElement>(null);
  const { narrow, settings, themeNote, pick, reset } = look;
  const { list, save, retry } = useLibrary();
  const actions = useListActions(list, { save, retry }, listPane, route);
  const isEmpty = list.status === "ready" && list.items.length === 0;

  return (
    <div className={isEmpty ? "lib is-empty" : "lib"}>
      <div className="bg">
        <header className="mast">
          <div className="brand">
            <h1>Threadsift</h1>
            <SettingsPanel
              settings={settings}
              themeNote={themeNote}
              modal={narrow}
              choose={pick}
              reset={reset}
              openInstanceSettings={openSettings}
            />
          </div>
          <PasteBox
            save={actions.saveAndShow}
            focusOnMount={arrived}
            items={knownItems(list)}
            request={actions.request}
          />
        </header>
        <main ref={listPane} className="list" tabIndex={-1}>
          <ListBody
            list={list}
            openId={route.openId}
            attention={actions.attention}
            retry={actions.retryAndKeepPlace}
            tryAgain={actions.tryAgain}
          />
        </main>
      </div>
    </div>
  );
}
