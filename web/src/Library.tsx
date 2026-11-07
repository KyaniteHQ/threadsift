import { useMemo } from "react";

import { ListColumn } from "./ListColumn.tsx";
import { ReaderPane } from "./ReaderPane.tsx";
import type { Route } from "./routing.ts";
import { useLibraryView } from "./use-library-view.ts";
import type { Look } from "./use-root.ts";

function Announcement({ text, failed }: Readonly<{ text: string; failed: boolean }>) {
  return failed ? (
    <div className="vh" role="alert">
      {text}
    </div>
  ) : (
    <output className="vh" aria-live="polite">
      {text}
    </output>
  );
}

export function Library({
  look,
  arrived,
  route,
  openSettings,
}: Readonly<{ look: Look; arrived: boolean; route: Route; openSettings: () => void }>) {
  const view = useLibraryView(look, route);
  const { root, counts, openItem, covered, side } = view;

  const classes = [
    "lib",
    ...(counts?.total === 0 ? ["is-empty"] : []),
    ...(covered && look.reader === "page" ? ["covered"] : []),
  ];

  const hasReader =
    counts !== null && counts.total > 0 && (look.reader === "pane" || openItem !== null);

  const { steps, step, close } = side.reader;
  const nav = useMemo(() => ({ steps, step, close }), [steps, step, close]);

  return (
    <div ref={root} className={classes.join(" ")}>
      <ListColumn
        view={view}
        look={look}
        arrived={arrived}
        openId={route.openId}
        openSettings={openSettings}
      />
      {hasReader ? (
        <ReaderPane
          item={openItem}
          controls={side.reader.controls}
          nav={nav}
          look={look}
          openSettings={openSettings}
        />
      ) : null}
      <Announcement text={side.reader.announcement.text} failed={side.reader.announcement.failed} />
    </div>
  );
}
