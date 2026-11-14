import { AI_DEADLINE_MS } from "../../src/core/ai-contract.ts";
import { VERIFY_WAIT_MS } from "../../src/core/grok-bot-contract.ts";
import { HOP_DEADLINE_MS } from "../../src/core/ports.ts";
import { FETCH_DEADLINE_MS, LEASE_WAIT_MS, PROBE_MS } from "../../src/core/request-waits.ts";
import { REQUEST_DEADLINE_MS } from "../../src/core/thread-fill.ts";

const MARGIN_MS = 20_000;

function pastWaitOf(outsideWaitMs: number): number {
  return outsideWaitMs + MARGIN_MS;
}

export const DATABASE_WRITE_DEADLINE_MS = MARGIN_MS;

export const PASTE_DEADLINE_MS = pastWaitOf(LEASE_WAIT_MS + FETCH_DEADLINE_MS);

export const HOP_WRITE_DEADLINE_MS = pastWaitOf(HOP_DEADLINE_MS);

export const REDDIT_VERIFY_DEADLINE_MS = pastWaitOf(REQUEST_DEADLINE_MS);

export const PROBED_WRITE_DEADLINE_MS = pastWaitOf(PROBE_MS);

export const AI_SAVE_DEADLINE_MS = pastWaitOf(2 * PROBE_MS);

export const AI_VERIFY_DEADLINE_MS = pastWaitOf(
  Math.max(AI_DEADLINE_MS, VERIFY_WAIT_MS + HOP_DEADLINE_MS),
);
