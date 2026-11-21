import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

import type { Instance } from "./instance.ts";

const HOLD_MS = 300;

const WRITER = `
import { DatabaseSync } from "node:sqlite";

const [file, holdMs, statements] = process.argv.slice(1);
const database = new DatabaseSync(file, { timeout: 5000 });

database.exec("BEGIN IMMEDIATE");

for (const statement of JSON.parse(statements)) database.exec(statement);

process.stdout.write("locked\\n");
await new Promise((resolve) => setTimeout(resolve, Number(holdMs)));
database.exec("COMMIT");
database.close();
`;

interface LockedWriter {
  readonly committed: Promise<void>;
}

export async function lockedWriter(
  instance: Instance,
  statements: readonly string[],
  holdMs = HOLD_MS,
): Promise<LockedWriter> {
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      WRITER,
      instance.databaseFile,
      String(holdMs),
      JSON.stringify(statements),
    ],
    { stdio: ["ignore", "pipe", "inherit"] },
  );

  const committed = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`the writer process exited with ${String(code)}`));
    });
  });

  const lines = createInterface({ input: child.stdout });

  let locked = false;

  for await (const line of lines) {
    if (line === "locked") {
      locked = true;
      break;
    }
  }

  lines.close();

  if (!locked) {
    await committed;

    throw new Error("the writer process ended before it held the lock");
  }

  return { committed };
}
