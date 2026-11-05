import { execSync } from "node:child_process";

import { expect } from "@playwright/test";

import { envValue } from "./env.ts";

const RESTART_TIMEOUT_MS = 90_000;

export async function restartTarget(baseUrl: string): Promise<void> {
  execSync(envValue("THREADSIFT_RESTART"), { stdio: "inherit" });
  await expect(async () => {
    const response = await fetch(new URL("/api/session", baseUrl));
    expect(response.status).toBe(200);
  }).toPass({ timeout: RESTART_TIMEOUT_MS });
}

export function isContainerTarget(): boolean {
  return process.env["THREADSIFT_TARGET"] === "container";
}

export function nodeInAppNetwork(): { command: string; args: string[] } {
  const words = (process.env["THREADSIFT_APP_EXEC"] ?? "").split(" ").filter((word) => word !== "");

  return words.length === 0
    ? { command: "node", args: [] }
    : { command: words[0] ?? "", args: [...words.slice(1), "node"] };
}
