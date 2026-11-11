import { type ProposalPage, ProposalPageSchema } from "../../src/core/proposal-contract.ts";
import { call, parsedFrom, withCursor } from "./calls.ts";

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
