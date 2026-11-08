import { useCallback, useMemo } from "react";

import { itemIdOf } from "../../src/core/item-path.ts";
import { usePath } from "./routing.ts";
import { Screen } from "./Screen.tsx";
import { screenOf, titleOf } from "./screens.ts";
import { ShareContext, useShareHandoff } from "./share-handoff.ts";
import { useArrival } from "./use-arrival.ts";
import { useDocumentTitle } from "./use-document-title.ts";
import { useRoot } from "./use-root.ts";
import { useSessionView } from "./use-session-view.ts";

export function App() {
  const { path, navigate, replace, leave } = usePath();

  const closeItem = useCallback(() => {
    if (itemIdOf(window.location.pathname) !== null) replace("/");
  }, [replace]);

  const { ref, attributes, barFonts, ...look } = useRoot(closeItem);
  const { view, ...session } = useSessionView();

  const route = useMemo(
    () => ({ openId: itemIdOf(path), navigate, replace, leave }),
    [path, navigate, replace, leave],
  );

  const screen = screenOf(view, path);
  useDocumentTitle(titleOf(screen));
  const arrived = useArrival(screen.name);
  const handoff = useShareHandoff();

  return (
    <div ref={ref} className="app" {...attributes} data-reader={look.reader}>
      <ShareContext value={handoff}>
        {barFonts ? (
          <Screen screen={screen} look={look} arrived={arrived} session={session} route={route} />
        ) : null}
      </ShareContext>
    </div>
  );
}
