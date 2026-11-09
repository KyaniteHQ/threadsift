import { knownItems } from "./list-state.ts";
import { Masthead } from "./Masthead.tsx";
import type { Pages } from "./routing.ts";
import type { LibraryView } from "./use-library-view.ts";
import type { Look } from "./use-root.ts";

export function LibraryMasthead({
  view,
  look,
  arrived,
  pages,
}: Readonly<{ view: LibraryView; look: Look; arrived: boolean; pages: Pages }>) {
  const { library, actions, side, counts } = view;

  return (
    <Masthead
      look={look}
      pages={pages}
      counts={counts}
      loading={view.reserves}
      filters={library.filters}
      choose={library.choose}
      clearChosen={library.clearChosen}
      save={actions.saveAndShow}
      focusOnMount={arrived}
      items={knownItems(library.list)}
      queue={actions.queue}
      open={side.openFromCard}
    />
  );
}
