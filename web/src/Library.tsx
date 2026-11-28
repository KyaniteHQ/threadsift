import { useMemo } from "react";

import { Announcement } from "./Announcement.tsx";
import { ListColumn } from "./ListColumn.tsx";
import { Masthead } from "./Masthead.tsx";
import { useListPanes } from "./PaneSplit.tsx";
import { ReaderPane } from "./ReaderPane.tsx";
import type { Route } from "./routing.ts";
import { SkipButton } from "./SkipButton.tsx";
import { useLibraryView } from "./use-library-view.ts";
import type { Look } from "./use-root.ts";

function libraryClass(empty: boolean, paged: boolean): string {
  return ["lib", ...(empty ? ["is-empty"] : []), ...(paged ? ["covered"] : [])].join(" ");
}

export function Library({
  look,
  arrived,
  route,
}: Readonly<{ look: Look; arrived: boolean; route: Route }>) {
  const view = useLibraryView(look, route);
  const { root, counts, openItem, covered, side } = view;

  const paged = covered && look.reader === "page";

  const hasReader =
    counts !== null && counts.total > 0 && (look.reader === "pane" || openItem !== null);

  const sheetOpen = hasReader && openItem !== null && look.reader === "sheet";
  const { steps, step, close } = side.reader;
  const nav = useMemo(() => ({ steps, step, close }), [steps, step, close]);
  const panes = useListPanes(root, look, hasReader);

  return (
    <>
      <SkipButton pane={view.listPane} inert={covered} />
      <Masthead inert={covered} hidden={paged} />
      <div ref={root} className={libraryClass(counts?.total === 0, paged)}>
        <ListColumn view={view} look={look} arrived={arrived} openId={route.openId} panes={panes} />
        {hasReader ? (
          <ReaderPane
            item={openItem}
            controls={side.reader.controls}
            nav={nav}
            look={look}
            tryAgain={view.actions.retryOpened}
            announcement={side.reader.announcement}
          />
        ) : null}
        {sheetOpen ? null : <Announcement {...side.reader.announcement} />}
      </div>
    </>
  );
}
