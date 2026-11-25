import { z } from "zod";

import {
  ACCEPT_REFUSALS,
  type Acceptance,
  AcceptedSchema,
  type ProposalState,
  type ProposalPage,
  ProposalPageSchema,
  ProposalStateSchema,
} from "../../src/core/contract/proposal-contract.ts";
import { call, parsedFrom, parsedOrGone, post, withCursor } from "./calls.ts";
import { DATABASE_WRITE_DEADLINE_MS } from "./write-deadlines.ts";

const BUSY = ["merge-busy", "no-provider"] as const satisfies readonly Acceptance[];

export type Busy = (typeof BUSY)[number];

export type Failure = "accept" | "reject";

const RefusalSchema = z.object({ error: z.enum(ACCEPT_REFUSALS) });

export function isBusy(outcome: Acceptance): outcome is Busy {
  return BUSY.some((busy) => busy === outcome);
}

export function fetchProposals(cursor: string | null, signal: AbortSignal): Promise<ProposalPage> {
  return parsedFrom("GET", withCursor("/api/proposals", cursor), ProposalPageSchema, { signal });
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

export async function sendAccept(id: number): Promise<Acceptance> {
  try {
    const response = await call(
      post(DATABASE_WRITE_DEADLINE_MS),
      `/api/proposals/${String(id)}/accept`,
    );

    const body: unknown = await response.json().catch(() => null);

    if (response.status === 409) {
      const refusal = RefusalSchema.safeParse(body);

      return refusal.success ? refusal.data.error : "unknown";
    }

    const accepted = AcceptedSchema.safeParse(body);

    return response.ok && accepted.success ? accepted.data.state : "unknown";
  } catch {
    return "unknown";
  }
}
