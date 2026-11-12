import { useCallback, useId } from "react";

import type { LostHighlightProposal } from "../../src/core/proposal-contract.ts";
import { HIGHLIGHTS_PAGE } from "./highlights-page-text.ts";
import { placePath } from "./place.ts";
import { LOST_HIGHLIGHT_EFFECT } from "./proposals-text.ts";
import { QuoteText } from "./QuoteText.tsx";
import { NOT_FOUND } from "./reader-text.ts";
import { useInternalLink } from "./routing.ts";

export function LostHighlightBody({
  proposal,
  open,
}: Readonly<{
  proposal: LostHighlightProposal;
  open: (itemId: number, highlightId: number) => void;
}>) {
  const { highlight } = proposal;
  const { item } = highlight;
  const quoteId = useId();

  const go = useInternalLink(
    useCallback(() => {
      open(item.id, highlight.id);
    }, [open, item.id, highlight.id]),
  );

  return (
    <>
      <h3 className="rl-title pr-effect">{LOST_HIGHLIGHT_EFFECT}</h3>
      <p className="rl-sum pr-item">
        <a
          className="pr-place"
          href={placePath(item.id, { kind: "highlight", id: highlight.id })}
          aria-describedby={quoteId}
          onClick={go}
        >
          {item.title === null ? HIGHLIGHTS_PAGE.untitled : <bdi dir="auto">{item.title}</bdi>}
        </a>
      </p>
      <blockquote id={quoteId} className="pr-quote" dir="auto">
        <QuoteText text={highlight.quote} />
      </blockquote>
      <p className="rd-note pr-gone">{NOT_FOUND}</p>
    </>
  );
}
