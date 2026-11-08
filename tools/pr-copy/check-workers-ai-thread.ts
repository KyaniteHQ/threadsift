import { authoredThread } from "./check-thread.ts";
import { endState, pasteThread } from "./copy-client.ts";
import {
  Count,
  MODEL,
  TaskRow,
  commentsInInputSql,
  boundTo,
  describeTask,
  digestTaskSql,
  firstRow,
  keptCommentsSql,
  unsubmittedKeptSql,
} from "./workers-ai-rows.ts";
import { type Scope, ITEM_DEADLINE_MS, describeEnd, until, untilIdle } from "./workers-ai-scope.ts";

export async function threadPhase(scope: Readonly<Scope>) {
  const { run, copy, findings } = scope;
  await run.pace.settle();
  await untilIdle(scope);
  const pasted = await pasteThread(copy, authoredThread(run.tag), scope.end);
  findings.item(pasted.id);
  const end = await endState(copy, pasted.id, until(scope, ITEM_DEADLINE_MS));
  findings.check(
    "the authored Reddit thread ends ready with a Digest",
    pasted.created &&
      end.status === "ready" &&
      end.digestOutcome === "none" &&
      end.digestTitle !== null,
    `${describeEnd(end.status, end.digestOutcome)}, title ${String(end.digestTitle !== null)}`,
  );

  const task = await firstRow(run, digestTaskSql(pasted.id), TaskRow, scope.end);
  findings.check(
    "the thread's Digest task row stores the binding, Provider and model",
    boundTo(task, MODEL) && task?.state === "done",
    describeTask(task),
  );

  const sent = await firstRow(run, commentsInInputSql(pasted.id), Count, scope.end);
  findings.check(
    "the stored Digest input carries the thread's comments (a copy built before the agent chose Kept comments fails here)",
    sent?.n === 1,
    `inputs with comments ${String(Math.min(sent?.n ?? 0, 99))}`,
  );

  const kept = await firstRow(run, keptCommentsSql(pasted.id), Count, scope.end);
  findings.check(
    "the Digest published a non-empty selection of Kept comments",
    (kept?.n ?? 0) > 0,
    `kept ${String(Math.min(kept?.n ?? 0, 99))}`,
  );

  const unsubmitted = await firstRow(run, unsubmittedKeptSql(pasted.id), Count, scope.end);
  findings.check(
    "every Kept comment was in the stored input",
    unsubmitted?.n === 0,
    `Kept comments outside the input ${String(Math.min(unsubmitted?.n ?? 0, 99))}`,
  );
}
