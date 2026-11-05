import { Screen } from "./Screen.tsx";
import { screenOf, titleOf } from "./screens.ts";
import { usePath } from "./session.ts";
import { useArrival } from "./use-arrival.ts";
import { useDocumentTitle } from "./use-document-title.ts";
import { useRoot } from "./use-root.ts";
import { useSessionView } from "./use-session-view.ts";

export function App() {
  const { ref, attributes, ...look } = useRoot();
  const { view, ...session } = useSessionView();
  const { path, navigate } = usePath();
  const screen = screenOf(view, path);
  useDocumentTitle(titleOf(screen));
  const arrived = useArrival(screen.name);

  return (
    <div ref={ref} className="app" {...attributes} data-reader="pane">
      <Screen screen={screen} look={look} arrived={arrived} session={session} navigate={navigate} />
    </div>
  );
}
