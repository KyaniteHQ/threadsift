import { AI_DEADLINE_MS } from "../../src/core/contract/ai-contract.ts";
import { VERIFY_DEADLINE_MS } from "../../src/core/contract/grok-bot-contract.ts";
import {
  FETCH_DEADLINE_MS,
  HOP_DEADLINE_MS,
  PROBE_MS,
  REQUEST_DEADLINE_MS,
} from "../../src/core/contract/request-waits.ts";
import { READ_DEADLINE_MS } from "./calls.ts";

const MARGIN_MS = READ_DEADLINE_MS;

function withMargin(waitMs: number): number {
  return waitMs + MARGIN_MS;
}

export const DATABASE_WRITE_DEADLINE_MS = MARGIN_MS;

const LINK_WAIT_MS = FETCH_DEADLINE_MS;

export const PASTE_DEADLINE_MS = withMargin(LINK_WAIT_MS);

export const IMPORT_BATCH_DEADLINE_MS = PASTE_DEADLINE_MS;

const SHORT_LINK_FETCHES = 2;

export const IMPORT_BATCH_LINKS = Math.floor(
  (IMPORT_BATCH_DEADLINE_MS - MARGIN_MS) / (SHORT_LINK_FETCHES * HOP_DEADLINE_MS),
);

export const IMPORT_BATCH_PATIENCE_MS = withMargin(IMPORT_BATCH_LINKS * LINK_WAIT_MS);

export const HOP_WRITE_DEADLINE_MS = withMargin(HOP_DEADLINE_MS);

export const REDDIT_VERIFY_DEADLINE_MS = withMargin(REQUEST_DEADLINE_MS);

export const PROBED_WRITE_DEADLINE_MS = withMargin(PROBE_MS);

export const AI_SAVE_DEADLINE_MS = withMargin(2 * PROBE_MS);

export const AI_VERIFY_DEADLINE_MS = withMargin(Math.max(AI_DEADLINE_MS, VERIFY_DEADLINE_MS));
