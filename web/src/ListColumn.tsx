import { LibraryMasthead } from "./LibraryMasthead.tsx";
import { ListBody, Notice } from "./ListBody.tsx";
import { ListTools } from "./ListTools.tsx";
import { HINT_LIST } from "./reader-text.ts";
import type { Pages } from "./routing.ts";
import { LOAD_FAILED, RETRY_LABEL } from "./text.ts";
import type { LibraryView } from "./use-library-view.ts";
import type { Look } from "./use-root.ts";

function LookupNotice({ failed, again }: Readonly<{ failed: boolean; again: () => void }>) {
  return failed ? <Notice text={LOAD_FAILED} action={again} label={RETRY_LABEL} alert /> : null;
}

export function ListColumn({
  view,
  look,
  arrived,
  openId,
  pages,
}: Readonly<{
  view: LibraryView;
  look: Look;
  arrived: boolean;
  openId: number | null;
  pages: Pages;
}>) {
  const { library, shown, reserves, actions, side, covered, openItem, listPane, searchField } =
    view;

  const hint =
    look.reader !== "pane" || (openItem !== null && side.reader.hintInBar) ? null : HINT_LIST;

  return (
    <div className="bg" inert={covered}>
      <LibraryMasthead view={view} look={look} arrived={arrived} pages={pages} />
      <ListTools
        list={shown}
        reserves={reserves}
        filters={library.filters}
        field={searchField}
        search={library.search}
        hint={hint}
        leave={side.leaveSearch}
      />
      <main ref={listPane} className="list" tabIndex={-1}>
        <LookupNotice failed={actions.lookupFailed} again={actions.lookAgain} />
        <ListBody
          list={shown}
          cardImages={look.settings.images === "on"}
          openId={openId}
          attention={actions.attention}
          attended={actions.attended}
          retry={actions.retryAndKeepPlace}
          tryAgain={actions.tryAgain}
          clearAll={view.clearAll}
          open={side.reader.open}
          toggleRead={side.reader.toggleRead}
          more={library.more}
        />
      </main>
    </div>
  );
}
