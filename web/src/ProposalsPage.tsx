import { useCallback, useLayoutEffect } from "react";

import type { Proposal, ProposalPage } from "../../src/core/proposal-contract.ts";
import { Announcement } from "./Announcement.tsx";
import { type Listing, ListPage } from "./ListPage.tsx";
import { localDate } from "./log-date.ts";
import { REJECT_SELECTOR, rejectSelectorOf } from "./proposal-dom.ts";
import { ProposalRow } from "./ProposalRow.tsx";
import { PROPOSALS_PAGE, proposalsEmptyLine } from "./proposals-text.ts";
import type { Pages } from "./routing.ts";
import { useProposalsPage } from "./use-proposals-page.ts";
import type { Focus } from "./use-proposals-page.ts";

const LISTING: Listing<ProposalPage, Proposal> = {
  text: PROPOSALS_PAGE,
  focus: REJECT_SELECTOR,
  head: () => PROPOSALS_PAGE.head,
  emptyLine: ({ provider, checkedAt }) =>
    proposalsEmptyLine(provider, checkedAt === null ? null : localDate(checkedAt)),
  rows: ({ proposals }) => proposals,
};

function useMoveFocus(focus: Readonly<Focus>, done: () => void) {
  useLayoutEffect(() => {
    if (focus.kind === "none") return;

    const target =
      focus.kind === "row"
        ? document.querySelector<HTMLElement>(rejectSelectorOf(focus.id))
        : document.querySelector<HTMLElement>("main h2");

    target?.focus();
    done();
  }, [focus, done]);
}

export function ProposalsPage({ pages, back }: Readonly<{ pages: Pages; back: () => void }>) {
  const { source, rowFor, announcement, notice, focus, focused, press } = useProposalsPage();

  useMoveFocus(focus, focused);

  const overviewFollows = source.state.status === "ready" && source.state.provider;

  const draw = useCallback(
    (proposal: Proposal) => (
      <ProposalRow
        key={proposal.id}
        proposal={proposal}
        overviewFollows={overviewFollows}
        row={rowFor(proposal.id)}
        accept={press.accept}
        reject={press.reject}
        open={pages.highlight}
        openTopic={pages.topic}
        openItem={pages.item}
      />
    ),
    [rowFor, overviewFollows, press, pages],
  );

  return (
    <>
      <ListPage source={source} listing={LISTING} draw={draw} back={back} notice={notice} />
      <Announcement text={announcement.text} failed={announcement.failed} />
    </>
  );
}
