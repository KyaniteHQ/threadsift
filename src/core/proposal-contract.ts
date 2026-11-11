import { z } from "zod";

import { PROPOSAL_KINDS } from "./kinds.ts";
import { parseLogCursor } from "./log-contract.ts";

const TagRefSchema = z
  .object({ id: z.number().int(), name: z.string(), items: z.number().int().min(0) })
  .readonly();

export const ProposalSchema = z
  .object({
    id: z.number().int(),
    kind: z.enum(PROPOSAL_KINDS),
    state: z.literal("open"),
    reason: z.string(),
    from: TagRefSchema,
    into: TagRefSchema,
  })
  .readonly();

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

export type Proposal = z.infer<typeof ProposalSchema>;

export type ProposalPage = z.infer<typeof ProposalPageSchema>;

export const ProposalQuerySchema = z.object({
  cursor: z
    .string()
    .refine((text) => parseLogCursor(text) !== null, "not a well-formed cursor")
    .optional(),
});
