import { inventory, prOf } from "./cloudflare.ts";
import { dispatchDelete, pullRequest } from "./github.ts";

export async function sweep(dryRun: boolean): Promise<void> {
  const found = await inventory();

  const resources = [
    ...found.workers.map((name) => ({ kind: "Worker", name })),
    ...found.databases.map((row) => ({ kind: "D1", name: row.name })),
    ...found.queues.map((row) => ({ kind: "Queue", name: row.name })),
  ];

  const numbers = [...new Set(resources.map((row) => prOf(row.name)))].toSorted((a, b) => a - b);

  await Promise.all(
    numbers.map(async (pr) => {
      const pull = await pullRequest(pr);

      if (pull.state !== "closed") return;

      const rows = resources.flatMap((row) =>
        prOf(row.name) === pr ? [`${row.kind} ${row.name}`] : [],
      );

      process.stdout.write(`Closed pull request ${String(pr)}: ${rows.join(", ")}\n`);

      if (!dryRun) await dispatchDelete(pr);
    }),
  );
}
