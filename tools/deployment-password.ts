import { readFileSync, statSync } from "node:fs";

import { z } from "zod";

import { CommandFailure } from "./command-failure.ts";

export function deploymentPassword(): string {
  try {
    const file = process.env["THREADSIFT_PASSWORD_FILE"];

    if (file === undefined) return z.string().min(1).parse(process.env["THREADSIFT_PASSWORD"]);

    if ((statSync(file).mode & 0o077) !== 0)
      throw new CommandFailure({
        kind: "check",
        reason: "Password file must be private",
        recovery: "Set mode 0600 on THREADSIFT_PASSWORD_FILE and run again.",
      });

    return z
      .string()
      .min(1)
      .parse(readFileSync(file, "utf8").replace(/\r?\n$/u, ""));
  } catch (error) {
    if (error instanceof CommandFailure) throw error;
    throw new CommandFailure({
      kind: "check",
      reason: "Owner password input unavailable",
      recovery:
        "Set THREADSIFT_PASSWORD_FILE to a readable private password file, or supply THREADSIFT_PASSWORD in the environment.",
    });
  }
}
