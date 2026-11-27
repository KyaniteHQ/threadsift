import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { nodeEnvironment } from "../src/targets/node/environment.ts";

const EVERY_VARIABLE = [
  "PORT",
  "DATA_DIR",
  "PATH",
  "GROK_HOME",
  "CLAUDE_CONFIG_DIR",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "CODEX_HOME",
  "THREADSIFT_FETCHERS",
  "THREADSIFT_GROK_AUTO_UPDATE",
  "SETUP_CODE",
  "PASSWORD_RESET_CODE",
  "THREADSIFT_SECRET_KEY",
  "THREADSIFT_PUBLIC_ORIGIN",
  "THREADSIFT_OPENROUTER_MAX_PRICE_ZERO",
] as const;

const allEmpty = Object.fromEntries(EVERY_VARIABLE.map((name) => [name, ""]));

describe("an install target reads a variable set to the empty string as an unset one", () => {
  it("makes the container's environment the same as when every variable is unset", () => {
    assert.deepEqual(nodeEnvironment(allEmpty), nodeEnvironment({}));
  });
});
