import { defineConfig } from "@playwright/test";

const baseURL = process.env["THREADSIFT_BASE_URL"];

if (baseURL === undefined) {
  throw new Error("Set THREADSIFT_BASE_URL; tools/e2e/container.sh and tools/e2e/worker.sh do");
}

export default defineConfig({
  testDir: "e2e",
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL },
});
