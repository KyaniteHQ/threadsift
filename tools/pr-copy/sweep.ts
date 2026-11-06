import { copyNumbers, inventory, prOf } from "./cloudflare.ts";
import { dispatchDelete, pullRequest, reopenedReason } from "./github.ts";

export async function sweep(dryRun: boolean): Promise<void> {
  const found = await inventory();

  const resources = [
    ...found.workers.map((name) => ({ kind: "Worker", name })),
    ...found.databases.map((row) => ({ kind: "D1", name: row.name })),
    ...found.queues.map((row) => ({ kind: "Queue", name: row.name })),
  ];

  const groups = Map.groupBy(resources, (row) => prOf(row.name));

  const closed = new Set(
    await Promise.all(
      copyNumbers(found).map(async (pr) =>
        reopenedReason(pr, await pullRequest(pr)) === null ? pr : null,
      ),
    ),
  );

  const deletes: number[] = [];

  for (const [pr, rows] of groups) {
    if (!closed.has(pr)) continue;
    process.stdout.write(
      `Closed pull request ${String(pr)}: ${rows.map((row) => `${row.kind} ${row.name}`).join(", ")}\n`,
    );
    deletes.push(pr);
  }

  if (!dryRun)
    await deletes.reduce(
      (pending, pr) => pending.then(() => dispatchDelete(pr)),
      Promise.resolve(),
    );
}
