import { useMemo } from "react";

import { itemIdOf } from "../../src/core/item-path.ts";
import { usePath } from "./routing.ts";
import { Screen } from "./Screen.tsx";
import { screenOf, titleOf } from "./screens.ts";
import { useArrival } from "./use-arrival.ts";
import { useDocumentTitle } from "./use-document-title.ts";
import { useRoot } from "./use-root.ts";
import { useSessionView } from "./use-session-view.ts";

export function App() {
  const { ref, attributes, ...look } = useRoot();
  const { view, ...session } = useSessionView();
  const { path, navigate, replace } = usePath();

  const route = useMemo(
    () => ({ openId: itemIdOf(path), navigate, replace }),
    [path, navigate, replace],
  );

  const screen = screenOf(view, path);
  useDocumentTitle(titleOf(screen));
  const arrived = useArrival(screen.name);

  return (
    <div ref={ref} className="app" {...attributes} data-reader="pane">
      <Screen screen={screen} look={look} arrived={arrived} session={session} route={route} />
    </div>
  );
}
