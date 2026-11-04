import { useRef, useState } from "react";

import { itemIdOf } from "../../src/core/item-path.ts";
import { useBands } from "./bands.ts";
import { Icon } from "./Icon.tsx";
import { ItemRow } from "./ItemRow.tsx";
import { type ListState, useLibrary } from "./library.ts";
import { PasteBox } from "./PasteBox.tsx";
import { EMPTY_LIST, LOAD_FAILED } from "./text.ts";

function ListPane({ list, openId }: Readonly<{ list: ListState; openId: number | null }>) {
  if (list.status === "loading") {
    return <main className="list" />;
  }

  if (list.status === "failed") {
    return (
      <main className="list">
        <div className="noresults">
          <p>{LOAD_FAILED}</p>
        </div>
      </main>
    );
  }

  if (list.items.length === 0) {
    return (
      <main className="list">
        <div className="empty">
          <Icon name="tray" className="ic ic-xl" />
          <h2>{EMPTY_LIST.heading}</h2>
          <p>{EMPTY_LIST.line}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="list">
      {list.items.map((item) => (
        <ItemRow key={item.id} item={item} now={list.loadedAt} isOpen={item.id === openId} />
      ))}
    </main>
  );
}

export function App() {
  const root = useRef<HTMLDivElement>(null);
  const bands = useBands(root);
  const { list, save } = useLibrary();
  const [openId] = useState(() => itemIdOf(window.location.pathname));

  const isEmpty = list.status === "ready" && list.items.length === 0;

  return (
    <div ref={root} className="app" data-layout="list" data-reader="pane" data-bp={bands}>
      <div className={isEmpty ? "lib is-empty" : "lib"}>
        <div className="bg">
          <div className="mast">
            <div className="brand">
              <h1>Threadsift</h1>
            </div>
            <PasteBox save={save} />
          </div>
          <ListPane list={list} openId={openId} />
        </div>
      </div>
    </div>
  );
}
