import { z } from "zod";

import { SOURCES } from "./item-contract.ts";

export const MERGE_KINDS = ["tag-merge", "topic-merge"] as const;

export const PIN_KINDS = [...MERGE_KINDS, "items-disagree"] as const;

export const PROPOSAL_KINDS = [
  ...MERGE_KINDS,
  "highlight-lost",
  "overview-gap",
  "items-disagree",
] as const;

export const PROPOSAL_STATES = ["open", "accepting", "rejected", "declined"] as const;

export type MergeKind = (typeof MERGE_KINDS)[number];

export type PinKind = (typeof PIN_KINDS)[number];

export type ProposalKind = (typeof PROPOSAL_KINDS)[number];

export type ProposalState = (typeof PROPOSAL_STATES)[number];

export const WEEKLY_TASK = {
  "tag-merge": "proposals",
  "topic-merge": "topic_proposals",
  "highlight-lost": "highlight_proposals",
  "overview-gap": "overview_proposals",
  "items-disagree": "disagreement_proposals",
} as const satisfies Readonly<Record<ProposalKind, string>>;

export type WeeklyTask = (typeof WEEKLY_TASK)[ProposalKind];

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
    failedRuns: z.number().int().min(0),
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

const ProposalSchema = z.discriminatedUnion("kind", [
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

export const ProposalStateSchema = z.object({ state: z.enum(PROPOSAL_STATES) }).readonly();

export const RejectedSchema = z.object({ state: z.literal("rejected") }).readonly();

export const AcceptedSchema = z.object({ state: z.enum(["done", "accepting"]) }).readonly();

export type Proposal = z.infer<typeof ProposalSchema>;

export type MergeProposal = z.infer<typeof MergeProposalSchema>;

export type LostHighlightProposal = z.infer<typeof LostHighlightProposalSchema>;

export type OverviewGapProposal = z.infer<typeof OverviewGapProposalSchema>;

export type ItemsDisagreeProposal = z.infer<typeof ItemsDisagreeProposalSchema>;

export type ProposalPage = z.infer<typeof ProposalPageSchema>;
