import { AI_DEADLINE_MS, AI_SAVE_ATTEMPTS } from "../../src/core/ai-contract.ts";
import { VERIFY_WAIT_MS } from "../../src/core/grok-bot-contract.ts";
import {
  FETCH_DEADLINE_MS,
  HOP_DEADLINE_MS,
  LEASE_WAIT_MS,
  PROBE_MS,
  REQUEST_DEADLINE_MS,
} from "../../src/core/request-waits.ts";
import { READ_DEADLINE_MS } from "./calls.ts";

const MARGIN_MS = READ_DEADLINE_MS;

function withMargin(waitMs: number): number {
  return waitMs + MARGIN_MS;
}

export const DATABASE_WRITE_DEADLINE_MS = MARGIN_MS;

export const PASTE_DEADLINE_MS = withMargin(LEASE_WAIT_MS + FETCH_DEADLINE_MS);

export const HOP_WRITE_DEADLINE_MS = withMargin(HOP_DEADLINE_MS);

export const REDDIT_VERIFY_DEADLINE_MS = withMargin(REQUEST_DEADLINE_MS);

export const PROBED_WRITE_DEADLINE_MS = withMargin(PROBE_MS);

export const AI_SAVE_DEADLINE_MS = withMargin((AI_SAVE_ATTEMPTS + 1) * PROBE_MS);

export const AI_VERIFY_DEADLINE_MS = withMargin(
  Math.max(AI_DEADLINE_MS, VERIFY_WAIT_MS + HOP_DEADLINE_MS),
);
