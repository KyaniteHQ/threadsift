import { LibraryMasthead } from "./LibraryMasthead.tsx";
import { ListBody } from "./ListBody.tsx";
import { ListTools } from "./ListTools.tsx";
import { HINT_LIST } from "./reader-text.ts";
import type { LibraryView } from "./use-library-view.ts";
import type { Look } from "./use-root.ts";

export function ListColumn({
  view,
  look,
  arrived,
  openId,
  openSettings,
}: Readonly<{
  view: LibraryView;
  look: Look;
  arrived: boolean;
  openId: number | null;
  openSettings: () => void;
}>) {
  const { library, actions, side, covered, openItem, listPane, searchField } = view;

  const hint =
    look.reader !== "pane" || (openItem !== null && side.reader.hintInBar) ? null : HINT_LIST;

  return (
    <div className="bg" inert={covered}>
      <LibraryMasthead view={view} look={look} arrived={arrived} openSettings={openSettings} />
      <ListTools
        list={library.list}
        filters={library.filters}
        field={searchField}
        search={library.search}
        hint={hint}
        leave={side.leaveSearch}
      />
      <main ref={listPane} className="list" tabIndex={-1}>
        <ListBody
          list={library.list}
          openId={openId}
          attention={actions.attention}
          attended={actions.attended}
          retry={actions.retryAndKeepPlace}
          tryAgain={actions.tryAgain}
          clearAll={view.clearAll}
          open={side.reader.open}
          toggleRead={side.reader.toggleRead}
        />
      </main>
    </div>
  );
}
