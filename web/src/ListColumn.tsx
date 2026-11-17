import { hasRows } from "./list-state.ts";
import { ListBody, Notice } from "./ListBody.tsx";
import { ListTools } from "./ListTools.tsx";
import { Masthead } from "./Masthead.tsx";
import { HINT_LIST } from "./reader-text.ts";
import type { Pages } from "./routing.ts";
import { SkipButton } from "./SkipButton.tsx";
import { LOAD_FAILED, RETRY_LABEL } from "./text.ts";
import type { LibraryView } from "./use-library-view.ts";
import type { Look } from "./use-root.ts";

function LookupNotice({ failed, again }: Readonly<{ failed: boolean; again: () => void }>) {
  return failed ? <Notice text={LOAD_FAILED} action={again} label={RETRY_LABEL} alert /> : null;
}

function LibraryList({
  view,
  look,
  openId,
}: Readonly<{ view: LibraryView; look: Look; openId: number | null }>) {
  const { library, shown, actions, side, listPane } = view;

  return (
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
  );
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
  const { library, shown, reserves, side, covered, openItem, listPane, searchField } = view;

  return (
    <div className="bg" inert={covered}>
      <SkipButton pane={listPane} />
      <Masthead
        look={look}
        pages={pages}
        counts={view.counts}
        loading={reserves}
        filters={library.filters}
        choose={library.choose}
        clearChosen={library.clearChosen}
        hasRows={hasRows(library.list)}
        save={view.actions.saveAndShow}
        focusOnMount={arrived}
        items={library.list.known}
        queue={view.actions.queue}
        open={side.openFromCard}
      />
      <ListTools
        list={shown}
        reserves={reserves}
        filters={library.filters}
        query={library.query}
        active={!covered}
        field={searchField}
        search={library.search}
        hint={
          look.reader !== "pane" || (openItem !== null && side.reader.hintInBar) ? null : HINT_LIST
        }
        leave={side.leaveSearch}
      />
      <LibraryList view={view} look={look} openId={openId} />
    </div>
  );
}
