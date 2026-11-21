import { useId } from "react";

import type { LostHighlightProposal } from "../../src/core/contract/proposal-contract.ts";
import { NOT_FOUND } from "../../src/core/contract/reader-text.ts";
import { HIGHLIGHTS_PAGE } from "./highlights-page-text.ts";
import { useNavigateLink } from "./navigate-context.ts";
import { placePath } from "./place.ts";
import { LOST_HIGHLIGHT_EFFECT } from "./proposals-text.ts";
import { QuoteText } from "./QuoteText.tsx";

export function LostHighlightBody({ proposal }: Readonly<{ proposal: LostHighlightProposal }>) {
  const { highlight } = proposal;
  const { item } = highlight;
  const quoteId = useId();
  const to = placePath(item.id, { kind: "highlight", id: highlight.id });
  const go = useNavigateLink(to);

  return (
    <>
      <h3 className="rl-title pr-effect">{LOST_HIGHLIGHT_EFFECT}</h3>
      <p className="rl-sum pr-item">
        <a className="pr-place" href={to} aria-describedby={quoteId} onClick={go}>
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
