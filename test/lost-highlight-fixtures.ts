import assert from "node:assert/strict";

import { z } from "zod";

import { codePointCount } from "../src/core/contract/code-points.ts";
import { selectorAt } from "../src/core/contract/highlight-anchor.ts";
import { HighlightResponseSchema } from "../src/core/contract/highlight-contract.ts";
import {
  type MergeProposal,
  type Proposal,
  type ProposalPage,
  ProposalPageSchema,
} from "../src/core/contract/proposal-contract.ts";
import type { Instance } from "./instance.ts";
import { paste, saveProvider } from "./related-fixtures.ts";
import { exec, rows, nextSweep } from "./sqlite-fixtures.ts";

export const ColumnsSchema = z.object({
  id: z.number(),
  item_id: z.number(),
  exact: z.string(),
  prefix: z.string(),
  suffix: z.string(),
  hint: z.number(),
  status: z.string(),
  start: z.number().nullable(),
});

const BEFORE = "A long sentence that comes before the passage and fills the stored context. ";

const AFTER = " A long sentence that comes after the passage and fills the stored context.";

const isMerge = (proposal: Readonly<Proposal>): proposal is MergeProposal =>
  proposal.kind === "tag-merge" || proposal.kind === "topic-merge";

export const mergesOf = (page: Readonly<ProposalPage>): readonly MergeProposal[] =>
  page.proposals.filter(isMerge);

export const textHolding = (passage: string): string => `${BEFORE}${passage}${AFTER}`;

const textHoldingTwice = (passage: string): string =>
  `${textHolding(passage)}\n\n${textHolding(passage)}`;

function pasteHolding(
  instance: Instance,
  slug: string,
  passage: string,
  title = `Title of ${slug}`,
): Promise<number> {
  return paste(instance, slug, { title, postText: textHolding(passage) });
}

export function selectorIn(text: string, passage: string) {
  const start = text.indexOf(passage);

  assert.notEqual(start, -1, `${passage} is in the text`);

  const selector = selectorAt(text, codePointCount(text, start), codePointCount(passage));

  assert.ok(selector !== null, `${passage} is a run of whole code points`);

  return { ...selector };
}

export async function keepPassage(
  instance: Instance,
  itemId: number,
  passage: string,
): Promise<number> {
  const reader = await instance.detail(itemId);

  const { highlight } = await instance.read(
    "POST",
    `/api/items/${String(itemId)}/highlights`,
    HighlightResponseSchema,
    {
      target: { kind: "post" },
      revision: reader.highlights.revisions.post,
      selector: selectorIn(reader.postText ?? "", passage),
    },
  );

  return highlight.id;
}

export function repaste(
  instance: Instance,
  slug: string,
  postText: string,
  title = `Title of ${slug}`,
): Promise<number> {
  return paste(instance, slug, { title, postText });
}

const StatusSchema = z.object({ status: z.string(), exact: z.string() });

export function highlightStatus(instance: Instance, id: number): string | undefined {
  return rows(instance, StatusSchema, "select status, exact from highlights where id = ?", id)[0]
    ?.status;
}

export async function keepLostHighlight(
  instance: Instance,
  slug: string,
  how: "gone" | "ambiguous" = "gone",
  passage = `the passage of ${slug}`,
): Promise<{ itemId: number; highlightId: number }> {
  const itemId = await pasteHolding(instance, slug, passage);
  const highlightId = await keepPassage(instance, itemId, passage);

  await repaste(
    instance,
    slug,
    how === "gone" ? textHolding("a different passage") : textHoldingTwice(passage),
  );

  assert.equal(highlightStatus(instance, highlightId), how);

  return { itemId, highlightId };
}

const IdSchema = z.object({ id: z.number() });

export async function proposeLost(
  instance: Instance,
  highlightId: number,
  state: "open" | "rejected" = "open",
): Promise<number> {
  await saveProvider(instance);
  exec(
    instance,
    "insert or replace into scheduled_runs (task, last_run_at) values ('overview_proposals', ?)",
    Date.now(),
  );
  exec(instance, "delete from scheduled_runs where task = 'highlight_proposals'");
  await nextSweep(instance);

  const [row] = rows(
    instance,
    IdSchema,
    "select proposal_id as id from highlight_lost_proposals where highlight_id = ?",
    highlightId,
  );

  if (row === undefined) throw new Error("the weekly check stored no Proposal for the Highlight");

  if (state === "rejected") {
    assert.equal(
      (await instance.send("POST", `/api/proposals/${String(row.id)}/reject`)).status,
      200,
    );
  }

  return row.id;
}

export async function listedIds(instance: Instance, kind: Proposal["kind"] | "all") {
  return (await readPage(instance)).proposals.flatMap((row) =>
    kind === "all" || row.kind === kind ? [row.id] : [],
  );
}

export const readPage = (instance: Instance, query = ""): Promise<ProposalPage> =>
  instance.read("GET", `/api/proposals${query}`, ProposalPageSchema);

const StateRowSchema = z.object({ id: z.number(), kind: z.string(), state: z.string() });

export const proposalRows = (instance: Instance) =>
  rows(instance, StateRowSchema, "select id, kind, state from proposals order by id");
