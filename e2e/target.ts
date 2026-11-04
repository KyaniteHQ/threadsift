import { execSync } from "node:child_process";

import { expect } from "@playwright/test";

const RESTART_TIMEOUT_MS = 90_000;

function restartCommand(): string {
  const command = process.env["THREADSIFT_RESTART"];

  if (command === undefined) {
    throw new Error("Set THREADSIFT_RESTART to the command that restarts the target");
  }

  return command;
}

export async function restartTarget(baseUrl: string): Promise<void> {
  execSync(restartCommand(), { stdio: "inherit" });
  await expect(async () => {
    const response = await fetch(new URL("/api/items", baseUrl));
    expect(response.status).toBe(200);
  }).toPass({ timeout: RESTART_TIMEOUT_MS });
}
