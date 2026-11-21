import { HIGHLIGHTS_PAGE } from "./highlights-page-text.ts";
import { HighlightsMain } from "./HighlightsMain.tsx";
import { PageBar } from "./PageBar.tsx";
import type { Look } from "./use-root.ts";

export function HighlightsPage({ look }: Readonly<{ look: Look }>) {
  return (
    <div className="pg">
      <PageBar title={HIGHLIGHTS_PAGE.title} />
      <HighlightsMain look={look} />
    </div>
  );
}
