import { randomBytes } from "node:crypto";

import { defineConfig } from "@playwright/test";
import { z } from "zod";

const PORT = z.coerce.number().int().default(8799).parse(process.env["THREADSIFT_SMOKE_PORT"]);

const BASE_URL = `http://127.0.0.1:${PORT}`;

const TARGET = z.enum(["worker", "container"]).parse(process.env["THREADSIFT_TARGET"]);

process.env["SETUP_CODE"] ??= randomBytes(24).toString("base64url");

process.env["THREADSIFT_SECRET_KEY"] ??= randomBytes(32).toString("hex");

const STATE = ".wrangler/smoke";

const WORKER = [
  `rm -rf ${STATE}`,
  "umask 077",
  `mkdir -p ${STATE}`,
  `printf 'SETUP_CODE=%s\\nTHREADSIFT_SECRET_KEY=%s\\n' "$SETUP_CODE" "$THREADSIFT_SECRET_KEY" > ${STATE}/env`,
  `exec worker-local ${STATE}/state ${PORT} --test-scheduled --ip 127.0.0.1 --inspector-port 0 --env-file ${STATE}/env`,
].join(" && ");

const CONTAINER_RUN = `podman run --rm --publish 127.0.0.1:${PORT}:8080 --env SETUP_CODE --env THREADSIFT_SECRET_KEY`;

const IMAGE = '"${THREADSIFT_IMAGE:?run through devenv tasks}"';

const CLAUDE_TOKEN = "CLAUDE_CODE_OAUTH_TOKEN";

const LIVE = process.env["THREADSIFT_LIVE"] === "1";

function liveContainer(): string {
  if ((process.env[CLAUDE_TOKEN] ?? "") === "")
    throw new Error(
      `${CLAUDE_TOKEN} is empty: run \`claude setup-token\` and set the token it prints, from the owner's secret store locally and from a secret of the post-merge environment in CI`,
    );

  return `exec ${CONTAINER_RUN} --env ${CLAUDE_TOKEN} ${IMAGE} sh -c 'npm install --global @anthropic-ai/claude-code && exec node src/targets/node/index.ts'`;
}

function server(target: "worker" | "container") {
  if (target === "worker") return { command: WORKER, timeout: 180_000 };

  return LIVE
    ? { command: liveContainer(), timeout: 180_000 }
    : { command: `exec ${CONTAINER_RUN} ${IMAGE}`, timeout: 60_000 };
}

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
      timeout: 1_200_000,
      use: { trace: "off" },
    },
  ],
  webServer: {
    ...server(TARGET),
    url: `${BASE_URL}/api/session`,
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 15_000 },
    stdout: "pipe",
  },
});
