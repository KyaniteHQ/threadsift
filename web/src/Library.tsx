import { useRef } from "react";

import type { Item } from "../../src/http/schemas.ts";
import { useLibrary } from "./library.ts";
import { ListBody } from "./ListBody.tsx";
import { PasteBox } from "./PasteBox.tsx";
import { SettingsPanel } from "./SettingsPanel.tsx";
import { useListActions } from "./use-list-actions.ts";
import type { useRoot } from "./use-root.ts";

const NO_ITEMS: readonly Item[] = [];

export type Look = Omit<ReturnType<typeof useRoot>, "ref" | "attributes">;

export function Library({
  look,
  arrived,
  openSettings,
}: Readonly<{ look: Look; arrived: boolean; openSettings: () => void }>) {
  const listPane = useRef<HTMLElement>(null);
  const { narrow, settings, themeNote, pick, reset } = look;
  const { list, save, retry } = useLibrary();
  const actions = useListActions(list, { save, retry }, listPane);
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
            items={list.status === "ready" ? list.items : NO_ITEMS}
            open={actions.openItem}
          />
        </header>
        <main ref={listPane} className="list" tabIndex={-1}>
          <ListBody
            list={list}
            openId={actions.openId}
            attention={actions.attention}
            marked={actions.marked}
            retry={actions.retryAndKeepPlace}
            tryAgain={actions.tryAgain}
          />
        </main>
      </div>
    </div>
  );
}
