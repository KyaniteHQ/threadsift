import { randomBytes } from "node:crypto";

import { defineConfig } from "@playwright/test";
import { z } from "zod";

const PORT = 8799;

const BASE_URL = `http://127.0.0.1:${PORT}`;

const TARGET = z.enum(["worker", "container"]).parse(process.env["THREADSIFT_TARGET"]);

process.env["SETUP_CODE"] ??= randomBytes(24).toString("base64url");

process.env["THREADSIFT_SECRET_KEY"] ??= randomBytes(32).toString("hex");

const IMAGE = "localhost/threadsift:smoke";

const STATE = ".wrangler/smoke";

const WORKER = [
  `rm -rf ${STATE}`,
  "umask 077",
  `mkdir -p ${STATE}`,
  `printf 'SETUP_CODE=%s\\nTHREADSIFT_SECRET_KEY=%s\\n' "$SETUP_CODE" "$THREADSIFT_SECRET_KEY" > ${STATE}/env`,
  `exec worker-local ${STATE}/state ${PORT} --test-scheduled --ip 127.0.0.1 --inspector-port 0 --env-file ${STATE}/env`,
].join(" && ");

const CONTAINER = [
  `podman build --signature-policy "\${THREADSIFT_PODMAN_POLICY:?run inside the devenv shell}" --tag ${IMAGE} --file Containerfile .`,
  `exec podman run --rm --publish 127.0.0.1:${PORT}:8080 --env SETUP_CODE --env THREADSIFT_SECRET_KEY ${IMAGE}`,
].join(" && ");

const SERVERS = {
  worker: { command: WORKER, timeout: 180_000 },
  container: { command: CONTAINER, timeout: 600_000 },
};

export default defineConfig({
  testDir: "smoke",
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: "list",
  use: { baseURL: BASE_URL, trace: "retain-on-failure" },
  projects: [
    { name: "smoke", testMatch: "smoke.spec.ts" },
    {
      name: "live",
      testMatch: "live.spec.ts",
      timeout: 480_000,
      use: { trace: "off" },
    },
  ],
  webServer: {
    ...SERVERS[TARGET],
    url: `${BASE_URL}/api/session`,
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 15_000 },
    stdout: "pipe",
  },
});
