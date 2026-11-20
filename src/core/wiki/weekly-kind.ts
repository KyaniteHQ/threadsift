import { type SQL, sql } from "drizzle-orm";
import type { z } from "zod";

import { defineAiKind } from "../ai/ai-kind.ts";
import type { AiTaskDefinition } from "../contract/ai-contract.ts";
import type { Database } from "../kernel/database.ts";
import { guardedOutcome } from "../kernel/guarded-outcome.ts";
import { type JobWrites, settled } from "../kernel/job-outcome.ts";

interface WeeklyRead<Sent> {
  readonly input: string;
  readonly inputRevision: number;
  readonly sent: Sent;
}

export interface WeeklyRun<Sent, Result> {
  readonly kind: string;
  readonly sent: z.ZodType<Sent>;
  readonly label: string;
  readonly event: string;
  readonly maxOutputTokens: number;
  readonly read: (db: Database) => Promise<WeeklyRead<Sent> | null>;
  readonly task: (sent: Sent) => AiTaskDefinition<Result>;
  readonly current: (sent: Sent) => SQL;
  readonly stored: (db: Database, done: Readonly<{ sent: Sent; result: Result }>) => JobWrites;
}

export function storedField<Value = unknown>(path: string): SQL<Value> {
  return sql<Value>`json_extract(stored.value, ${`$.${path}`})`;
}

export function weeklyKind<Sent, Result>(run: Readonly<WeeklyRun<Sent, Result>>) {
  return defineAiKind({
    kind: run.kind,
    context: run.sent,
    label: run.label,
    task: run.task,
    current: run.current,
    prepare: async ({ db }) => {
      const read = await run.read(db);

      if (read === null) return settled(guardedOutcome(db, sql`1`));

      return {
        kind: "ask",
        context: read.sent,
        input: read.input,
        inputRevision: read.inputRevision,
        maxOutputTokens: run.maxOutputTokens,
      };
    },
    refused: () => ({ event: run.event }),
    publish: (db, { context, result }) => ({
      writes: run.stored(db, { sent: context, result }),
    }),
  });
}
