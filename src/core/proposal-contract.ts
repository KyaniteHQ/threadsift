import { z } from "zod";

import { MERGE_KINDS, SOURCES } from "./kinds.ts";

const SubjectRefSchema = z
  .object({ id: z.number().int(), name: z.string(), items: z.number().int().min(0) })
  .readonly();

export const ListedStateSchema = z.enum(["open", "accepting"]);

const MergeProposalSchema = z
  .object({
    id: z.number().int(),
    kind: z.enum(MERGE_KINDS),
    state: ListedStateSchema,
    reason: z.string(),
    from: SubjectRefSchema,
    into: SubjectRefSchema,
  })
  .readonly();

const LostHighlightProposalSchema = z
  .object({
    id: z.number().int(),
    kind: z.literal("highlight-lost"),
    state: ListedStateSchema,
    highlight: z
      .object({
        id: z.number().int(),
        quote: z.string(),
        item: z
          .object({
            id: z.number().int(),
            source: z.enum(SOURCES),
            title: z.string().nullable(),
          })
          .readonly(),
      })
      .readonly(),
  })
  .readonly();

const OverviewGapProposalSchema = z
  .object({
    id: z.number().int(),
    kind: z.literal("overview-gap"),
    state: ListedStateSchema,
    topic: z
      .object({
        key: z.string(),
        name: z.string(),
        uncovered: z.number().int().min(1),
        items: z.number().int().min(1),
      })
      .readonly(),
  })
  .readonly();

const DisagreeingItemSchema = z
  .object({ id: z.number().int(), title: z.string(), summary: z.string() })
  .readonly();

const ItemsDisagreeProposalSchema = z
  .object({
    id: z.number().int(),
    kind: z.literal("items-disagree"),
    state: ListedStateSchema,
    reason: z.string(),
    topic: z.object({ key: z.string(), name: z.string() }).readonly(),
    first: DisagreeingItemSchema,
    second: DisagreeingItemSchema,
  })
  .readonly();

export const ProposalSchema = z.discriminatedUnion("kind", [
  MergeProposalSchema,
  LostHighlightProposalSchema,
  OverviewGapProposalSchema,
  ItemsDisagreeProposalSchema,
]);

export const ProposalPageSchema = z
  .object({
    proposals: z.array(ProposalSchema).readonly(),
    checkedAt: z.number().int().nullable(),
    provider: z.boolean(),
    next: z.string().nullable(),
  })
  .readonly();

export const ProposalIdParamSchema = z.object({ id: z.string().regex(/^\d{1,16}$/u) });

export const RejectedSchema = z.object({ state: z.literal("rejected") }).readonly();

export const AcceptedSchema = z.object({ state: z.enum(["done", "accepting"]) }).readonly();

export type Proposal = z.infer<typeof ProposalSchema>;

export type MergeProposal = z.infer<typeof MergeProposalSchema>;

export type LostHighlightProposal = z.infer<typeof LostHighlightProposalSchema>;

export type OverviewGapProposal = z.infer<typeof OverviewGapProposalSchema>;

export type ItemsDisagreeProposal = z.infer<typeof ItemsDisagreeProposalSchema>;

export type ProposalPage = z.infer<typeof ProposalPageSchema>;
