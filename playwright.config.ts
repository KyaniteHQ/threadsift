import { randomBytes } from "node:crypto";
import { join } from "node:path";

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
  `exec worker-local ${STATE}/state ${PORT} --ip 127.0.0.1 --inspector-port 0 --env-file ${STATE}/env`,
].join(" && ");

const CONTAINER_PORT = 8080;

const CONTAINER_NAME = `threadsift-smoke-${PORT}`;

const CONTAINER_STATE = join(import.meta.dirname, ".wrangler", `smoke-container-${PORT}`);

const CONTAINER_CAPTURE = join(import.meta.dirname, "test-results", "container-failure");

const CONTAINERS_CONF = join(CONTAINER_STATE, "containers.conf");

const CONTAINERS_CONF_LINES = [
  "[network]",
  `pasta_options = ["--debug", "--log-file", ${JSON.stringify(join(CONTAINER_STATE, "pasta.log"))}]`,
];

function quote(text: string): string {
  return `'${text.replaceAll("'", "'\\''")}'`;
}

const CONTAINER_RUN = [
  `rm -rf ${quote(CONTAINER_STATE)}`,
  `mkdir -p ${quote(CONTAINER_STATE)}`,
  `printf '%s\\n' ${CONTAINERS_CONF_LINES.map((line) => quote(line)).join(" ")} > ${quote(CONTAINERS_CONF)}`,
  `export CONTAINERS_CONF_OVERRIDE=${quote(CONTAINERS_CONF)}`,
  [
    "exec podman run --rm",
    `--name ${CONTAINER_NAME}`,
    `--log-driver k8s-file --log-opt ${quote(`path=${join(CONTAINER_STATE, "container.log")}`)}`,
    `--publish 127.0.0.1:${PORT}:${CONTAINER_PORT} --env SETUP_CODE --env THREADSIFT_SECRET_KEY`,
  ].join(" "),
].join(" && ");

const IMAGE = '"${THREADSIFT_IMAGE:?run through devenv tasks}"';

const INSTALL_CLAUDE_CODE =
  "env -u CLAUDE_CODE_OAUTH_TOKEN -u SETUP_CODE -u THREADSIFT_SECRET_KEY npm install --global --min-release-age=3 @anthropic-ai/claude-code";

const LIVE_CONTAINER = `${CONTAINER_RUN} --env CLAUDE_CODE_OAUTH_TOKEN ${IMAGE} sh -c '${INSTALL_CLAUDE_CODE} && claude --version && exec node src/targets/node/index.ts'`;

const LIVE = process.env["THREADSIFT_LIVE"] === "1";

const SERVERS = {
  worker: { command: WORKER, timeout: 180_000 },
  container: LIVE
    ? { command: LIVE_CONTAINER, timeout: 180_000 }
    : { command: `${CONTAINER_RUN} ${IMAGE}`, timeout: 60_000 },
};

export default defineConfig({
  testDir: "smoke",
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [
    ["list"],
    ...(TARGET === "container" && !LIVE
      ? [
          [
            "./smoke/container-capture.ts",
            {
              container: CONTAINER_NAME,
              stateDir: CONTAINER_STATE,
              captureDir: CONTAINER_CAPTURE,
              publishedUrl: `${BASE_URL}/api/session`,
              insideUrl: `http://127.0.0.1:${CONTAINER_PORT}/api/session`,
              port: PORT,
              image: process.env["THREADSIFT_IMAGE"],
            },
          ] as const,
        ]
      : []),
  ],
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
    ...SERVERS[TARGET],
    url: `${BASE_URL}/api/session`,
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 15_000 },
    stdout: "pipe",
  },
});
