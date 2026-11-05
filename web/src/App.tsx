import { TITLES } from "./access-text.ts";
import { SETTINGS_PATH, Screen } from "./Screen.tsx";
import { usePath } from "./session.ts";
import { useArrival } from "./use-arrival.ts";
import { useDocumentTitle } from "./use-document-title.ts";
import { useRoot } from "./use-root.ts";
import { type View, useSessionView } from "./use-session-view.ts";

function titleOf(view: View, path: string): string {
  if (view === "setup") {
    return TITLES.setup;
  }

  if (view === "signed-out") {
    return TITLES.login;
  }

  return view === "signed-in" && path === SETTINGS_PATH ? TITLES.settings : TITLES.library;
}

function screenOf(view: View, path: string): string {
  if (view !== "signed-in") {
    return view;
  }

  return path === SETTINGS_PATH ? "settings" : "library";
}

export function App() {
  const { ref, attributes, ...look } = useRoot();
  const { view, unavailable, refresh } = useSessionView();
  const { path, navigate } = usePath();
  useDocumentTitle(titleOf(view, path));
  const arrived = useArrival(screenOf(view, path));

  return (
    <div ref={ref} className="app" {...attributes} data-reader="pane">
      <Screen
        view={view}
        unavailable={unavailable}
        path={path}
        look={look}
        arrived={arrived}
        refresh={refresh}
        navigate={navigate}
      />
    </div>
  );
}
