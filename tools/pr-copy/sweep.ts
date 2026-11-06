import { copyNumbers, inventory, prOf } from "./cloudflare.ts";
import { dispatchDelete, pullRequest, isClosed } from "./github.ts";

function failure(pr: number, error: Readonly<Error>): string {
  return `pull request ${String(pr)}: ${error.message}`;
}

async function lookupPull(pr: number) {
  try {
    return { pr, closed: isClosed(await pullRequest(pr)) };
  } catch (error) {
    throw new Error(failure(pr, error instanceof Error ? error : new Error(String(error))), {
      cause: error,
    });
  }
}

export async function sweep(dryRun: boolean): Promise<void> {
  const found = await inventory();

  const resources = [
    ...found.workers.map((name) => ({ kind: "Worker", name })),
    ...found.databases.map((row) => ({ kind: "D1", name: row.name })),
    ...found.queues.map((row) => ({ kind: "Queue", name: row.name })),
  ];

  const groups = Map.groupBy(resources, (row) => prOf(row.name));

  const lookups = await Promise.allSettled(copyNumbers(found).map((pr) => lookupPull(pr)));

  const failures: string[] = [];
  const closed = new Set<number>();
  const deletes: number[] = [];

  for (const result of lookups) {
    if (result.status === "rejected") {
      failures.push(String(result.reason));
      continue;
    }

    if (result.value.closed) closed.add(result.value.pr);
  }

  for (const [pr, rows] of groups) {
    if (!closed.has(pr)) continue;
    process.stdout.write(
      `Closed pull request ${String(pr)}: ${rows.map((row) => `${row.kind} ${row.name}`).join(", ")}\n`,
    );
    deletes.push(pr);
  }

  if (!dryRun)
    await deletes.reduce(async (pending, pr) => {
      await pending;

      try {
        await dispatchDelete(pr);
      } catch (error) {
        failures.push(failure(pr, error instanceof Error ? error : new Error(String(error))));
      }
    }, Promise.resolve());

  if (failures.length > 0) throw new Error(`Sweep failures: ${failures.join("; ")}`);
}
