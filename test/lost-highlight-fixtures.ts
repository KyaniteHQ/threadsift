import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import { drizzle } from "drizzle-orm/sqlite-proxy";
import { z } from "zod";

import { HighlightResponseSchema } from "../src/core/highlight-contract.ts";
import type { Database } from "../src/core/ports.ts";
import {
  type MergeProposal,
  type Proposal,
  type ProposalPage,
  ProposalPageSchema,
} from "../src/core/proposal-contract.ts";
import { batchTo, proxyTo } from "../src/targets/node/database.ts";
import type { Instance } from "./instance.ts";
import { exec, paste, rows, saveProvider } from "./related-fixtures.ts";

const BEFORE = "A long sentence that comes before the passage and fills the stored context. ";

const AFTER = " A long sentence that comes after the passage and fills the stored context.";

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const isMerge = (proposal: Readonly<Proposal>): proposal is MergeProposal =>
  proposal.kind === "tag-merge" || proposal.kind === "topic-merge";

export const mergesOf = (page: Readonly<ProposalPage>): readonly MergeProposal[] =>
  page.proposals.filter(isMerge);

export const textHolding = (passage: string): string => `${BEFORE}${passage}${AFTER}`;

export const textHoldingTwice = (passage: string): string =>
  `${textHolding(passage)}\n\n${textHolding(passage)}`;

export function pasteHolding(
  instance: Instance,
  slug: string,
  passage: string,
  title = `Title of ${slug}`,
): Promise<number> {
  return paste(instance, slug, { title, postText: textHolding(passage) });
}

export async function keepPassage(
  instance: Instance,
  itemId: number,
  passage: string,
): Promise<number> {
  const reader = await instance.detail(itemId);
  const text = reader.postText ?? "";
  const start = text.indexOf(passage);

  assert.notEqual(start, -1, `${passage} is in the text`);

  const { highlight } = await instance.read(
    "POST",
    `/api/items/${String(itemId)}/highlights`,
    HighlightResponseSchema,
    {
      target: { kind: "post" },
      revision: reader.highlights.revisions.post,
      selector: {
        exact: passage,
        prefix: text.slice(Math.max(0, start - 32), start),
        suffix: text.slice(start + passage.length, start + passage.length + 32),
        hint: start,
      },
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

export async function nextTick(instance: Instance): Promise<void> {
  exec(instance, "delete from scheduled_runs where task = 'sweep'");
  await instance.tick();
}

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
  await nextTick(instance);

  const [row] = rows(
    instance,
    IdSchema,
    "select id from proposals where kind = 'highlight-lost' and highlight_id = ?",
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

export const readPage = (instance: Instance, query = ""): Promise<ProposalPage> =>
  instance.read("GET", `/api/proposals${query}`, ProposalPageSchema);

const StateRowSchema = z.object({ id: z.number(), kind: z.string(), state: z.string() });

export const proposalRows = (instance: Instance) =>
  rows(instance, StateRowSchema, "select id, kind, state from proposals order by id");

export function withoutForeignKeys(file: string): Database {
  const sqlite = new DatabaseSync(file);
  const query = proxyTo(sqlite);
  const batch = batchTo(sqlite);

  return drizzle(query, async (queries) => {
    sqlite.exec("PRAGMA foreign_keys = OFF");

    try {
      return await batch(queries);
    } finally {
      sqlite.exec("PRAGMA foreign_keys = ON");
    }
  });
}

const RunSchema = z.object({ last_run_at: z.number() });

export const claims = (instance: Instance, task: string) =>
  rows(instance, RunSchema, "select last_run_at from scheduled_runs where task = ?", task);

export function moveClaimBack(instance: Instance, task: string): void {
  exec(
    instance,
    "update scheduled_runs set last_run_at = last_run_at - ? where task = ?",
    WEEK_MS,
    task,
  );
}
