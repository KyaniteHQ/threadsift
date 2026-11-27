import { useCallback, useLayoutEffect } from "react";

import type { Proposal, ProposalPage } from "../../src/core/contract/proposal-contract.ts";
import { AiSettingsLink } from "./AiSettingsLink.tsx";
import { Announcement } from "./Announcement.tsx";
import { type Listing, ListPage } from "./ListPage.tsx";
import { localDate } from "./log-date.ts";
import { REJECT_SELECTOR } from "./proposal-dom.ts";
import { ProposalRow } from "./ProposalRow.tsx";
import { PROPOSALS_PAGE, proposalsEmptyLine } from "./proposals-text.ts";
import { useProposalsPage } from "./use-proposals-page.ts";

const LISTING: Listing<ProposalPage, Proposal> = {
  text: PROPOSALS_PAGE,
  focus: REJECT_SELECTOR,
  head: () => PROPOSALS_PAGE.head,
  intro: PROPOSALS_PAGE.intro,
  emptyLine: ({ provider, checkedAt }) =>
    proposalsEmptyLine(provider, checkedAt === null ? null : localDate(checkedAt)),
  emptyFoot: ({ provider }) => (provider ? null : <AiSettingsLink />),
  rows: ({ proposals }) => proposals,
};

function useResultFocus(requested: boolean, done: () => void) {
  useLayoutEffect(() => {
    if (!requested) return;

    const target = document.querySelector<HTMLElement>("main h2, main button");

    target?.focus();
    done();
  }, [requested, done]);
}

export function ProposalsPage() {
  const { source, rowFor, announcement, notice, focusResult, focusedResult, press } =
    useProposalsPage();

  useResultFocus(focusResult, focusedResult);

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
      />
    ),
    [rowFor, overviewFollows, press],
  );

  return (
    <>
      <ListPage source={source} listing={LISTING} draw={draw} notice={notice} />
      <Announcement text={announcement} failed={false} />
    </>
  );
}
