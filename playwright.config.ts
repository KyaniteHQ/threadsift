import { join } from "node:path";

import { defineConfig } from "@playwright/test";

import { OWNER_STATE_FILE } from "./e2e/access.ts";
import { envValue, optionalEnv } from "./e2e/env.ts";

const baseURL = envValue("THREADSIFT_BASE_URL");
const stateDir = envValue("THREADSIFT_E2E_DIR");
const runDir = optionalEnv("THREADSIFT_RUN_DIR");

export default defineConfig({
  testDir: "e2e",
  workers: 1,
  expect: { timeout: 30_000 },
  outputDir: runDir === undefined ? "test-results" : join(runDir, "results"),
  preserveOutput: runDir === undefined ? "failures-only" : "always",
  reporter: [
    ["list"],
    [
      "html",
      {
        open: "never",
        outputFolder: runDir === undefined ? "playwright-report" : join(runDir, "html"),
      },
    ],
  ],
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL, storageState: join(stateDir, OWNER_STATE_FILE) },
});
