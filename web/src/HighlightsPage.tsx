import { HIGHLIGHTS_PAGE } from "./highlights-page-text.ts";
import { HighlightsMain } from "./HighlightsMain.tsx";
import { PageBar } from "./PageBar.tsx";
import type { Route } from "./routing.ts";
import type { Look } from "./use-root.ts";

export function HighlightsPage({
  look,
  route,
  back,
}: Readonly<{ look: Look; route: Route; back: () => void }>) {
  return (
    <div className="pg hp">
      <PageBar title={HIGHLIGHTS_PAGE.title} back={back} />
      <HighlightsMain look={look} route={route} />
    </div>
  );
}
