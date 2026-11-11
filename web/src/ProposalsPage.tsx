import { useCallback, useLayoutEffect } from "react";

import type { Proposal, ProposalPage } from "../../src/core/proposal-contract.ts";
import { Announcement } from "./Announcement.tsx";
import { type Listing, ListPage } from "./ListPage.tsx";
import { localDate } from "./log-date.ts";
import { REJECT_SELECTOR, rejectSelectorOf } from "./proposal-dom.ts";
import { ProposalRow } from "./ProposalRow.tsx";
import { PROPOSALS_PAGE, proposalsEmptyLine } from "./proposals-text.ts";
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

export function ProposalsPage({ back }: Readonly<{ back: () => void }>) {
  const { source, pending, failed, announcement, notice, focus, focused, reject } =
    useProposalsPage();

  useMoveFocus(focus, focused);

  const press = useCallback(
    (proposal: Proposal) => {
      void reject(proposal);
    },
    [reject],
  );

  const draw = useCallback(
    (proposal: Proposal) => (
      <ProposalRow
        key={proposal.id}
        proposal={proposal}
        pending={pending.has(proposal.id)}
        failed={failed.has(proposal.id)}
        reject={press}
      />
    ),
    [pending, failed, press],
  );

  return (
    <>
      <ListPage source={source} listing={LISTING} draw={draw} back={back} notice={notice} />
      <Announcement text={announcement.text} failed={announcement.failed} />
    </>
  );
}
