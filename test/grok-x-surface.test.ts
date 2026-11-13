import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  UNPROVEN,
  afterPreflight,
  checkedRun,
  permission,
  preflightResultOf,
  sameBinary,
} from "../src/targets/node/grok-proof.ts";
import {
  PROVEN_VERSION,
  type ToolList,
  isProvenVersion,
  localToolNames,
  toolsVerdict,
} from "../src/targets/node/grok-surface.ts";

const listed = (...names: readonly string[]): ToolList => ({ kind: "listed", names });

describe("the run surface is proven by the version and the empty local tool list", () => {
  const LIST = JSON.stringify([{ function: { name: "grep" } }, { function: { name: "write" } }]);
  const binary = { path: "/data/grok/bin/grok", size: 10, modifiedMs: 5 };

  it("proves only the exact proven version string", () => {
    assert.deepEqual(
      [
        isProvenVersion(PROVEN_VERSION),
        isProvenVersion("grok 1.0.78 (abc)"),
        isProvenVersion(`${PROVEN_VERSION} `),
        isProvenVersion(null),
      ],
      [true, false, false, false],
    );
  });

  it("proves an empty tool list, refuses an extra tool and cannot confirm an unreadable or missing file", () => {
    assert.deepEqual(
      [
        toolsVerdict(listed()),
        toolsVerdict(listed("grep", "write")),
        toolsVerdict({ kind: "unreadable" }),
        toolsVerdict({ kind: "absent" }),
      ],
      ["proven", "extra-tools", "tools-unreadable", "tools-unreadable"],
    );
  });

  it("sorts the tool names it reads and reads nothing from a text that is not a tool list", () => {
    assert.deepEqual(localToolNames(LIST), ["grep", "write"]);
    assert.equal(localToolNames("not json"), null);
  });

  it("checks a finished run by its tool list, also when the run failed", () => {
    const clean = { kind: "exited", code: 0, stdout: "" } as const;
    const failed = { kind: "exited", code: 1, stdout: "" } as const;

    assert.deepEqual(
      [
        checkedRun({ end: clean, tools: listed() }),
        checkedRun({ end: failed, tools: listed("run_terminal_command") }),
        checkedRun({ end: clean, tools: { kind: "absent" } }),
        checkedRun({ end: failed, tools: { kind: "absent" } }),
        checkedRun({ end: { kind: "aborted" }, tools: { kind: "unreadable" } }),
      ],
      [
        { kind: "surface-held" },
        { kind: "barred", verdict: "extra-tools" },
        {
          kind: "discard",
          refusal: {
            kind: "refused",
            refusal: { status: "unreadable", category: "surface-unproven" },
            exit: null,
          },
        },
        {
          kind: "keep",
          refusal: {
            kind: "refused",
            refusal: { status: "unreadable", category: "cli-error" },
            exit: 1,
          },
        },
        {
          kind: "reprove",
          refusal: {
            kind: "refused",
            refusal: { status: "timeout", category: "deadline" },
            exit: null,
          },
        },
      ],
    );
  });

  it("keeps an unreadable tool list from refusing the binary for good", () => {
    assert.deepEqual(
      [
        preflightResultOf("tools-unreadable", PROVEN_VERSION),
        preflightResultOf("extra-tools", PROVEN_VERSION),
      ],
      [
        { kind: "inconclusive" },
        { kind: "judged", verdict: "extra-tools", version: PROVEN_VERSION },
      ],
    );
    assert.equal(
      permission(afterPreflight(binary, preflightResultOf("tools-unreadable", null)), binary),
      "preflight",
    );
  });

  it("proves again only for an unproven binary or one whose path, size or time changed", () => {
    const proven = afterPreflight(binary, {
      kind: "judged",
      verdict: "proven",
      version: PROVEN_VERSION,
    });

    const refused = afterPreflight(binary, {
      kind: "judged",
      verdict: "extra-tools",
      version: PROVEN_VERSION,
    });

    assert.deepEqual(
      [
        permission(UNPROVEN, binary),
        permission(proven, binary),
        permission(proven, { ...binary, size: 11 }),
        permission(proven, { ...binary, modifiedMs: 6 }),
        permission(proven, { ...binary, path: "/other/grok" }),
        permission(refused, binary),
        permission(refused, { ...binary, size: 11 }),
        permission(afterPreflight(binary, { kind: "inconclusive" }), binary),
      ],
      [
        "preflight",
        "allowed",
        "preflight",
        "preflight",
        "preflight",
        "refused",
        "preflight",
        "preflight",
      ],
    );
  });

  it("tells a binary that changed after the proof from the one that was proven", () => {
    assert.deepEqual(
      [
        sameBinary(binary, { ...binary }),
        sameBinary(binary, { ...binary, modifiedMs: 6 }),
        sameBinary(binary, null),
      ],
      [true, false, false],
    );
  });
});
