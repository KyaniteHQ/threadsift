import { TITLES } from "./access-text.ts";
import { SETTINGS_PATH, Screen } from "./Screen.tsx";
import { usePath } from "./session.ts";
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

export function App() {
  const { ref, attributes, ...look } = useRoot();
  const { view, refresh } = useSessionView();
  const { path, navigate } = usePath();
  useDocumentTitle(titleOf(view, path));

  return (
    <div ref={ref} className="app" {...attributes} data-reader="pane">
      <Screen view={view} path={path} look={look} refresh={refresh} navigate={navigate} />
    </div>
  );
}
