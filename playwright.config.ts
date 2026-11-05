import { join } from "node:path";

import { defineConfig } from "@playwright/test";

import { OWNER_STATE_FILE } from "./e2e/access.ts";
import { envValue } from "./e2e/env.ts";

const baseURL = envValue("THREADSIFT_BASE_URL");
const stateDir = envValue("THREADSIFT_E2E_DIR");

export default defineConfig({
  testDir: "e2e",
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL, storageState: join(stateDir, OWNER_STATE_FILE) },
});
