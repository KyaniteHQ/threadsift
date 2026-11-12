import { z } from "zod";

import { type ProposalPage, ProposalPageSchema } from "../../src/core/proposal-contract.ts";
import { call, parsedFrom, withCursor } from "./calls.ts";

export type Busy = "merge-busy" | "topic-busy";

export type Acceptance = "done" | "accepting" | Busy | "not-current" | "unknown";

const RefusalSchema = z.object({ error: z.enum(["merge-busy", "topic-busy", "not-current"]) });

export function fetchProposals(cursor: string | null): Promise<ProposalPage> {
  return parsedFrom("GET", withCursor("/api/proposals", cursor), ProposalPageSchema);
}

export async function sendReject(id: number): Promise<"rejected" | "unknown"> {
  try {
    const response = await call("POST", `/api/proposals/${String(id)}/reject`);

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
    const response = await call("POST", `/api/proposals/${String(id)}/accept`);

    if (response.status !== 409) return ANSWERS.get(response.status) ?? "unknown";

    const refusal = RefusalSchema.safeParse(await response.json().catch(() => null));

    return refusal.success ? refusal.data.error : "unknown";
  } catch {
    return "unknown";
  }
}
