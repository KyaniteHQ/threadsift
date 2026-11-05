import { join } from "node:path";

import { defineConfig } from "@playwright/test";

import { OWNER_STATE_FILE } from "./e2e/access.ts";

const baseURL = process.env["THREADSIFT_BASE_URL"];
const stateDir = process.env["THREADSIFT_E2E_DIR"];

if (baseURL === undefined || stateDir === undefined) {
  throw new Error(
    "Set THREADSIFT_BASE_URL and THREADSIFT_E2E_DIR; tools/e2e/container.sh and tools/e2e/worker.sh do",
  );
}

export default defineConfig({
  testDir: "e2e",
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL, storageState: join(stateDir, OWNER_STATE_FILE) },
});
