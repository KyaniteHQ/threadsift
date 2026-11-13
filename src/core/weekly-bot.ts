import { sql } from "drizzle-orm";

import { botTaskKind } from "./bot-task-kind.ts";
import { guardedOutcome } from "./guarded-outcome.ts";
import { settled } from "./job-outcome.ts";
import { type WeeklyModelRun, storedOutcome } from "./weekly-model-run.ts";

export function weeklyBotKind<Sent, Result>(run: Readonly<WeeklyModelRun<Sent, Result>>) {
  return botTaskKind({
    context: run.sent,
    task: run.task,
    current: run.current,
    prepare: async ({ db }) => {
      const read = await run.read(db);

      if (read === null) return settled(guardedOutcome(db, sql`1`));

      return {
        kind: "ask",
        start: {
          kind: run.kind,
          inputs: read.input,
          inputRevision: read.inputRevision,
          context: JSON.stringify(read.sent),
        },
      };
    },
    apply: ({ db }, _job, { context, taskId, result }) =>
      Promise.resolve(storedOutcome(db, run, { sent: context, taskId, result })),
  });
}
