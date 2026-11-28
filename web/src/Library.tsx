import { useMemo } from "react";

import { Announcement } from "./Announcement.tsx";
import { ListColumn } from "./ListColumn.tsx";
import { ReaderPane } from "./ReaderPane.tsx";
import type { Route } from "./routing.ts";
import { useLibraryView } from "./use-library-view.ts";
import type { Look } from "./use-root.ts";

export function Library({
  look,
  arrived,
  route,
}: Readonly<{ look: Look; arrived: boolean; route: Route }>) {
  const view = useLibraryView(look, route);
  const { root, counts, openItem, covered, side } = view;

  const classes = [
    "lib",
    ...(counts?.total === 0 ? ["is-empty"] : []),
    ...(covered && look.reader === "page" ? ["covered"] : []),
  ];

  const hasReader =
    counts !== null && counts.total > 0 && (look.reader === "pane" || openItem !== null);

  const sheetOpen = hasReader && openItem !== null && look.reader === "sheet";
  const { steps, step, close } = side.reader;
  const nav = useMemo(() => ({ steps, step, close }), [steps, step, close]);

  return (
    <div ref={root} className={classes.join(" ")}>
      <ListColumn view={view} look={look} arrived={arrived} openId={route.openId} />
      {hasReader ? (
        <ReaderPane
          item={openItem}
          controls={side.reader.controls}
          nav={nav}
          look={look}
          tryAgain={view.actions.retryOpened}
          refusedRetry={view.actions.refusedRetry}
          announcement={side.reader.announcement}
        />
      ) : null}
      {sheetOpen ? null : <Announcement {...side.reader.announcement} />}
    </div>
  );
}
