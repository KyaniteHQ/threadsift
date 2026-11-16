import { z } from "zod";

import type { ProposalState } from "../../src/core/kinds.ts";
import {
  type ProposalPage,
  ProposalPageSchema,
  ProposalStateSchema,
} from "../../src/core/proposal-contract.ts";
import { call, parsedFrom, parsedOrGone, post, withCursor } from "./calls.ts";
import { DATABASE_WRITE_DEADLINE_MS } from "./write-deadlines.ts";

const BUSY_ANSWERS = ["merge-busy", "topic-busy", "no-provider"] as const;

export type Busy = (typeof BUSY_ANSWERS)[number];

export type Failure = "accept" | "reject";

export type Acceptance = "done" | "accepting" | Busy | "not-current" | "unknown";

const RefusalSchema = z.object({ error: z.enum([...BUSY_ANSWERS, "not-current"]) });

export function isBusy(outcome: Acceptance): outcome is Busy {
  return BUSY_ANSWERS.some((each) => each === outcome);
}

export function fetchProposals(cursor: string | null): Promise<ProposalPage> {
  return parsedFrom("GET", withCursor("/api/proposals", cursor), ProposalPageSchema);
}

export function fetchProposalState(id: number): Promise<ProposalState | "gone"> {
  return parsedOrGone(`/api/proposals/${String(id)}`, ProposalStateSchema, ({ state }) => state);
}

export async function sendReject(id: number): Promise<"rejected" | "unknown"> {
  try {
    const response = await call(
      post(DATABASE_WRITE_DEADLINE_MS),
      `/api/proposals/${String(id)}/reject`,
    );

    return response.ok ? "rejected" : "unknown";
  } catch {
    return "unknown";
  }
}

const ANSWERS = new Map<number, Acceptance>([
  [200, "done"],
  [202, "accepting"],
]);

export async function sendAccept(id: number): Promise<Acceptance> {
  try {
    const response = await call(
      post(DATABASE_WRITE_DEADLINE_MS),
      `/api/proposals/${String(id)}/accept`,
    );

    if (response.status !== 409) return ANSWERS.get(response.status) ?? "unknown";

    const refusal = RefusalSchema.safeParse(await response.json().catch(() => null));

    return refusal.success ? refusal.data.error : "unknown";
  } catch {
    return "unknown";
  }
}
