import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { X_API_REFUSALS } from "../src/core/contract/x-api-contract.ts";
import { answerOf, concludedOfRefusal } from "../src/features/x/core/x-api-answer.ts";
import type { Json } from "./instance.ts";

const NOW = Date.parse("2026-11-28T12:00:00.000Z");

const PROBLEMS = "https://api.x.com/2/problems";

function wire(status: number, body: Json, headers: Readonly<Record<string, string>> = {}) {
  return {
    status,
    header: (name: string) => headers[name] ?? null,
    text: JSON.stringify(body),
  };
}

function problem(type: string, detail = "Synthetic detail.") {
  return { type: `${PROBLEMS}/${type}`, title: "Synthetic", detail };
}

describe("an X API answer maps to the reader's own failure note, or to a wait until X's reset", () => {
  it("passes a 200 on with its text, the 200 that carries a deleted post's error included", () => {
    const text = JSON.stringify({ errors: [problem("resource-not-found")] });

    assert.deepEqual(answerOf({ status: 200, header: () => null, text }, NOW), {
      kind: "ok",
      text,
    });
  });

  it("names a rejected key, an app outside pay-per-use, a blocked address and any other refusal apart", () => {
    assert.deepEqual(
      [
        answerOf(wire(401, problem("unauthorized")), NOW),
        answerOf(wire(403, problem("client-not-enrolled")), NOW),
        answerOf(wire(403, problem("client-forbidden")), NOW),
        answerOf(
          wire(403, problem("not-authorized-for-resource", "client IP not allowed: 192.0.2.10")),
          NOW,
        ),
        answerOf(wire(403, problem("not-authorized-for-resource")), NOW),
        answerOf(wire(400, problem("invalid-request")), NOW),
      ].map((answer) => (answer.kind === "refused" ? [answer.reason, answer.status] : answer.kind)),
      [
        ["api-key-rejected", 401],
        ["api-not-enrolled", 403],
        ["api-not-enrolled", 403],
        ["api-ip-blocked", 403],
        ["api-refused", 403],
        ["api-refused", 400],
      ],
    );
  });

  it("reads a 402 and a 429 of a capped account as credits run out, and any other 429 as a wait until x-rate-limit-reset", () => {
    const reset = String(NOW / 1000 + 300);

    assert.deepEqual(
      [
        answerOf(wire(402, problem("payment-required")), NOW),
        answerOf(wire(429, problem("usage-capped")), NOW),
        answerOf(wire(429, problem("rate-limit-exceeded"), { "x-rate-limit-reset": reset }), NOW),
        answerOf(wire(429, problem("rate-limit-exceeded")), NOW),
        answerOf(
          wire(429, problem("rate-limit-exceeded"), {
            "x-rate-limit-reset": String(NOW / 1000 - 1),
          }),
          NOW,
        ),
      ],
      [
        { kind: "refused", reason: "api-out-of-credits", status: 402 },
        { kind: "refused", reason: "api-out-of-credits", status: 429 },
        { kind: "limited", until: NOW + 300_000 },
        { kind: "limited", until: NOW + 60_000 },
        { kind: "limited", until: NOW + 60_000 },
      ],
    );
  });

  it("reads a 5xx as X out of reach, even when its body is not JSON", () => {
    assert.deepEqual(
      answerOf({ status: 503, header: () => null, text: "Service Unavailable" }, NOW),
      { kind: "refused", reason: "api-unreachable", status: 503 },
    );
  });

  it("ends the Item with the X API reader's own note for every refusal", () => {
    assert.deepEqual(
      Object.fromEntries(X_API_REFUSALS.map((reason) => [reason, concludedOfRefusal(reason)])),
      {
        "secret-missing": { status: "not-requested", note: "api-key-unopened" },
        "not-configured": { status: "not-requested", note: "api-not-set-up" },
        "api-key-rejected": { status: "not-requested", note: "api-key-rejected" },
        "api-not-enrolled": { status: "not-requested", note: "api-not-enrolled" },
        "api-ip-blocked": { status: "not-requested", note: "api-ip-blocked" },
        "api-out-of-credits": { status: "not-requested", note: "api-out-of-credits" },
        "api-rate-limited": { status: "network", note: "api-unreachable" },
        "api-refused": { status: "not-requested", note: "api-refused" },
        "api-unreachable": { status: "network", note: "api-unreachable" },
        "api-answer-refused": { status: "unreadable", note: "api-answer-unreadable" },
      },
    );
  });
});
