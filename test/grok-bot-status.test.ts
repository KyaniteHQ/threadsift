import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resultOfStatus } from "../src/core/grok-bot.ts";

describe("the status of the bot's answer maps to one result", () => {
  it("maps 200 to ok, 401 and 403 to wrong-key, 404 to not-found, and every other status to bot-error", () => {
    assert.deepEqual(
      [200, 401, 403, 404, 202, 204, 301, 400, 429, 500, 503].map((status) =>
        resultOfStatus(status),
      ),
      [
        "ok",
        "wrong-key",
        "wrong-key",
        "not-found",
        "bot-error",
        "bot-error",
        "bot-error",
        "bot-error",
        "bot-error",
        "bot-error",
        "bot-error",
      ],
    );
  });
});
