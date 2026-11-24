import { DatabaseSync } from "node:sqlite";

import type { Instance } from "./instance.ts";

export function exec(
  instance: Instance,
  query: string,
  ...params: readonly (string | number | null)[]
) {
  const database = new DatabaseSync(instance.databaseFile);

  try {
    database.prepare(query).run(...params);
  } finally {
    database.close();
  }
}

export const script = (instance: Instance, statements: string): void => {
  const database = new DatabaseSync(instance.databaseFile);

  try {
    database.exec(statements);
  } finally {
    database.close();
  }
};
