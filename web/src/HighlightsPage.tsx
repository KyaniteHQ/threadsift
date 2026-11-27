import { HIGHLIGHTS_PAGE } from "./highlights-page-text.ts";
import { HighlightsMain } from "./HighlightsMain.tsx";
import { PageFrame } from "./PageFrame.tsx";
import type { Look } from "./use-root.ts";

export function HighlightsPage({ look }: Readonly<{ look: Look }>) {
  return (
    <PageFrame title={HIGHLIGHTS_PAGE.title}>
      <HighlightsMain look={look} />
    </PageFrame>
  );
}
