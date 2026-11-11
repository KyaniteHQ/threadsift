import { useMemo } from "react";

import { Announcement } from "./Announcement.tsx";
import { ListColumn } from "./ListColumn.tsx";
import { PagesScope } from "./pages-scope.ts";
import { ReaderPane } from "./ReaderPane.tsx";
import type { Pages, Route } from "./routing.ts";
import { useLibraryView } from "./use-library-view.ts";
import type { Look } from "./use-root.ts";

export function Library({
  look,
  arrived,
  route,
  pages,
}: Readonly<{ look: Look; arrived: boolean; route: Route; pages: Pages }>) {
  const view = useLibraryView(look, route);
  const { root, counts, openItem, covered, side, shown, expectsEmpty } = view;

  const classes = [
    "lib",
    ...(counts?.total === 0 || (shown.status === "loading" && expectsEmpty) ? ["is-empty"] : []),
    ...(covered && look.reader === "page" ? ["covered"] : []),
  ];

  const hasReader =
    counts !== null && counts.total > 0 && (look.reader === "pane" || openItem !== null);

  const sheetOpen = hasReader && openItem !== null && look.reader === "sheet";
  const { steps, step, close } = side.reader;
  const nav = useMemo(() => ({ steps, step, close }), [steps, step, close]);

  return (
    <PagesScope value={pages}>
      <div ref={root} className={classes.join(" ")}>
        <ListColumn view={view} look={look} arrived={arrived} openId={route.openId} pages={pages} />
        {hasReader ? (
          <ReaderPane
            item={openItem}
            controls={side.reader.controls}
            nav={nav}
            look={look}
            pages={pages}
            tryAgain={view.actions.retryItem}
            announcement={side.reader.announcement}
          />
        ) : null}
        {sheetOpen ? null : <Announcement {...side.reader.announcement} />}
      </div>
    </PagesScope>
  );
}
