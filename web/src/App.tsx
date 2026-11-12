import { Suspense, useMemo } from "react";

import { itemIdOf } from "../../src/core/item-path.ts";
import { usePath } from "./routing.ts";
import { Screen } from "./Screen.tsx";
import { screenOf, titleOf } from "./screens.ts";
import { ShareContext, useShareHandoff } from "./share-handoff.ts";
import { useArrival } from "./use-arrival.ts";
import { useDocumentTitle } from "./use-document-title.ts";
import { type Look, useRoot } from "./use-root.ts";
import { useSessionView } from "./use-session-view.ts";

export function App({ settings }: Readonly<{ settings: Look["settings"] }>) {
  const { path, navigate, replace, leave, closeItem } = usePath();

  const { ref, attributes, ...look } = useRoot(closeItem, settings);
  const { view, ...session } = useSessionView();

  const route = useMemo(
    () => ({ path, openId: itemIdOf(path), navigate, replace, leave }),
    [path, navigate, replace, leave],
  );

  const screen = screenOf(view, path);
  useDocumentTitle(titleOf(screen));
  const arrived = useArrival(screen.name);
  const handoff = useShareHandoff();

  return (
    <div ref={ref} className="app" {...attributes} data-reader={look.reader}>
      <ShareContext value={handoff}>
        <Suspense fallback={null}>
          <Screen screen={screen} look={look} arrived={arrived} session={session} route={route} />
        </Suspense>
      </ShareContext>
    </div>
  );
}
