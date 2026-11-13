import type { z } from "zod";

import type { BotTaskStart } from "./bot-task-start.ts";
import type { BotTaskRow } from "./bot-task-states.ts";
import type { ClaimedJob, JobOutcome, SettledOutcome } from "./job-outcome.ts";
import type { Database } from "./ports.ts";

export interface BotInstructions {
  readonly instructions: string;
  readonly schema: z.core.JSONSchema.BaseSchema;
}

export type BotPreparation =
  | { readonly kind: "ask"; readonly start: BotTaskStart }
  | { readonly kind: "settled"; readonly outcome: JobOutcome };

export type BotParse =
  | {
      readonly kind: "valid";
      readonly apply: (db: Database, task: Readonly<Pick<BotTaskRow, "id">>) => SettledOutcome;
    }
  | { readonly kind: "invalid"; readonly reasons: string };

export interface BotTaskKind {
  readonly prepare: (db: Database, job: Readonly<ClaimedJob>) => Promise<BotPreparation>;
  readonly describe: (context: string) => BotInstructions | null;
  readonly parse: (context: string, resultText: string) => BotParse;
}
