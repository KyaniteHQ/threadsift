import { z } from "zod";

import { type ProposalPage, ProposalPageSchema } from "../../src/core/proposal-contract.ts";
import { call, parsedFrom, withCursor } from "./calls.ts";

export type Acceptance = "done" | "accepting" | "busy" | "unknown";

const BusySchema = z.object({ error: z.literal("merge-busy") });

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

    return BusySchema.safeParse(await response.json().catch(() => null)).success
      ? "busy"
      : "unknown";
  } catch {
    return "unknown";
  }
}
