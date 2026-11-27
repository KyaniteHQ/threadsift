import { useId } from "react";

import type { LostHighlightProposal } from "../../src/core/contract/proposal-contract.ts";
import { NOT_FOUND } from "../../src/core/contract/reader-text.ts";
import { FinalLine } from "./FinalLine.tsx";
import { HIGHLIGHTS_PAGE } from "./highlights-page-text.ts";
import { InternalLink } from "./InternalLink.tsx";
import { placePath } from "./place.ts";
import { LOST_HIGHLIGHT_EFFECT, PROPOSAL_WORDS } from "./proposals-text.ts";
import { QuoteText } from "./QuoteText.tsx";

export function LostHighlightBody({ proposal }: Readonly<{ proposal: LostHighlightProposal }>) {
  const { highlight } = proposal;
  const { item } = highlight;
  const quoteId = useId();
  const to = placePath(item.id, { kind: "highlight", id: highlight.id });

  return (
    <>
      <h3 className="rl-title pr-effect">{LOST_HIGHLIGHT_EFFECT}</h3>
      <p className="rl-sum pr-item">
        <InternalLink className="pr-place" to={to} aria-describedby={quoteId}>
          {item.title === null ? HIGHLIGHTS_PAGE.untitled : <bdi dir="auto">{item.title}</bdi>}
        </InternalLink>
      </p>
      <blockquote id={quoteId} className="pr-quote flat-note" dir="auto">
        <QuoteText text={highlight.quote} />
      </blockquote>
      <p className="rd-note pr-gone">{NOT_FOUND}</p>
      <FinalLine proposal={proposal} className="pr-final" text={PROPOSAL_WORDS.highlightRemoved} />
    </>
  );
}
