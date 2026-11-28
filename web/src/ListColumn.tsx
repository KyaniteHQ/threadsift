import { type Filters, chosenCount, isSearching } from "./filters.ts";
import { hasRows } from "./list-state.ts";
import { ListBody } from "./ListBody.tsx";
import { ListTools } from "./ListTools.tsx";
import { Masthead } from "./Masthead.tsx";
import { HINT_LIST } from "./reader-text.ts";
import { RetryNotice } from "./RetryRegions.tsx";
import { SkipButton } from "./SkipButton.tsx";
import { CLEAR_ALL, CLEAR_FILTERS, CLEAR_SEARCH, LOAD_FAILED } from "./text.ts";
import type { LibraryView } from "./use-library-view.ts";
import type { Look } from "./use-root.ts";

function clearLabelOf(filters: Readonly<Filters>): string {
  if (chosenCount(filters) === 0) return CLEAR_SEARCH;

  return isSearching(filters) ? CLEAR_ALL : CLEAR_FILTERS;
}

function LibraryList({
  view,
  look,
  openId,
}: Readonly<{ view: LibraryView; look: Look; openId: number | null }>) {
  const { library, actions, side, listPane } = view;

  return (
    <main ref={listPane} className="list" tabIndex={-1}>
      <RetryNotice failed={actions.lookupFailed} text={LOAD_FAILED} action={actions.lookAgain} />
      <RetryNotice
        failed={library.list.status === "failed"}
        text={LOAD_FAILED}
        action={actions.retryAndKeepPlace}
      />
      <ListBody
        list={library.list}
        cardImages={look.settings.images === "on"}
        openId={openId}
        attention={actions.attention}
        attended={actions.attended}
        tryAgain={actions.tryAgain}
        clearAll={view.clearAll}
        clearLabel={clearLabelOf(library.filters)}
        open={side.reader.open}
        readerCard={side.reader.readerCard}
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
}: Readonly<{
  view: LibraryView;
  look: Look;
  arrived: boolean;
  openId: number | null;
}>) {
  const { library, side, covered, openItem, listPane, searchField } = view;

  return (
    <div className="bg" inert={covered}>
      <SkipButton pane={listPane} />
      <Masthead
        look={look}
        counts={view.counts}
        loading={library.list.status === "loading"}
        filters={library.filters}
        choose={library.choose}
        clearChosen={library.clearChosen}
        hasRows={hasRows(library.list)}
        save={view.actions.saveAndShow}
        focusOnMount={arrived}
        items={library.list.known}
        queue={view.actions.queue}
        open={side.reader.open}
      />
      <ListTools
        list={library.list}
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
