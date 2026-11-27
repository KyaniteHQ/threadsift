import { Suspense, useMemo, useState } from "react";

import { itemIdOf } from "../../src/core/contract/item-path.ts";
import { usePath } from "./routing.ts";
import { Screen } from "./Screen.tsx";
import { screenOf, titleOf } from "./screens.ts";
import { ShareContext, useShareHandoff } from "./share-handoff.ts";
import { useArrival } from "./use-arrival.ts";
import { PageNameContext, useDocumentTitle } from "./use-document-title.ts";
import { type Look, useRoot } from "./use-root.ts";
import { useSessionView } from "./use-session-view.ts";

export function App({ settings }: Readonly<{ settings: Look["settings"] }>) {
  const { path, navigate, replace, leave, atOnce, closeItem } = usePath();

  const { ref, attributes, ...look } = useRoot(closeItem, settings);
  const { view, ...session } = useSessionView();

  const route = useMemo(
    () => ({ path, openId: itemIdOf(path), navigate, replace, leave, atOnce }),
    [path, navigate, replace, leave, atOnce],
  );

  const screen = screenOf(view, path);
  const [name, setName] = useState("");
  useDocumentTitle(titleOf(screen, name));
  const arrived = useArrival(screen.name);
  const handoff = useShareHandoff();

  return (
    <div ref={ref} className="app" {...attributes} data-reader={look.reader}>
      <PageNameContext value={setName}>
        <ShareContext value={handoff}>
          <Suspense fallback={null}>
            <Screen screen={screen} look={look} arrived={arrived} session={session} route={route} />
          </Suspense>
        </ShareContext>
      </PageNameContext>
    </div>
  );
}
