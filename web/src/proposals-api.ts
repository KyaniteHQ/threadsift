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
import type { RESTORING_CODE } from "../../src/core/contract/restore-contract.ts";
import { call, parsedFrom, parsedOrGone, post, withCursor } from "./calls.ts";
import { type Restoring, isRestoring, unlessRestoring } from "./unavailable.ts";
import { DATABASE_WRITE_DEADLINE_MS } from "./write-deadlines.ts";

export type Busy = Extract<Acceptance, "merge-busy" | "no-provider">;

export type Failure = "accept" | "reject";

const RefusalSchema = z.object({ error: z.enum(ACCEPT_REFUSALS) });

export type Answer = Exclude<Acceptance, typeof RESTORING_CODE>;

const answered = (answer: Answer) => ({ kind: "answer", answer }) as const;

export type Accepted = ReturnType<typeof answered> | Restoring;

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

export async function sendAccept(id: number): Promise<Accepted> {
  try {
    const response = await unlessRestoring(
      await call(post(DATABASE_WRITE_DEADLINE_MS), `/api/proposals/${String(id)}/accept`),
    );

    if (isRestoring(response)) return response;

    const body: unknown = await response.json().catch(() => null);

    if (response.status === 409) {
      const refusal = RefusalSchema.safeParse(body);

      return answered(refusal.success ? refusal.data.error : "unknown");
    }

    const accepted = AcceptedSchema.safeParse(body);

    return answered(response.ok && accepted.success ? accepted.data.state : "unknown");
  } catch {
    return answered("unknown");
  }
}
