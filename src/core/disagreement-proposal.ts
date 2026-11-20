import { acceptDisagreement } from "./disagreement-accept.ts";
import { DISAGREEMENT, staleDisagreements } from "./disagreement-rows.ts";
import type { ProposalKindSpec } from "./proposal-kind.ts";
import type { PageRow } from "./proposal-rows.ts";
import { modelCheck } from "./weekly-check.ts";

function disagreeOf(row: Readonly<PageRow>) {
  return {
    id: row.id,
    kind: row.kind,
    state: row.state,
    reason: row.reason ?? "",
    topic: { key: row.topicKey, name: row.topicName },
    first: row.first,
    second: row.second,
  };
}

export const ITEMS_DISAGREE: ProposalKindSpec<"items-disagree"> = {
  stage: "disagreement-proposals",
  accept: ({ db }, id) => acceptDisagreement(db, id),
  listedWhile: DISAGREEMENT.listed,
  pageEntry: disagreeOf,
  weekly: modelCheck("items-disagree", (db, now) => [staleDisagreements(db, now)]),
};
