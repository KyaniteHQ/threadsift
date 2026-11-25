import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { type ExitedEnd, signInFrom } from "../src/targets/node/cli-sign-in.ts";
import { loginStatusOf } from "../src/targets/node/codex-protocol.ts";
import { signInOf } from "../src/targets/node/grok-sign-in.ts";

const NO_ALIASES =
  'WARNING: proceeding, even though we could not create PATH aliases: Refusing to create helper binaries under temporary dir "/tmp" (codex_home: AbsolutePathBuf("/tmp/tmp.XINvPv1oxj"))\n';

const finished = (code: number | null, stderr: string, stdout = ""): ExitedEnd => ({
  kind: "exited",
  code,
  stdout,
  stderr,
});

const codexStatus = (end: ExitedEnd) => signInFrom(end, loginStatusOf);

describe("the sign-in state read from a finished probe of a CLI", () => {
  it("reads codex login status by its exit code and its Not logged in line", () => {
    assert.deepEqual(
      [
        codexStatus(finished(0, "")),
        codexStatus(finished(1, `${NO_ALIASES}Not logged in\n`)),
        codexStatus(
          finished(
            1,
            `${NO_ALIASES}Error loading configuration: /tmp/tmp.yuHYnB4iPJ/config.toml:1:6: key with no value, expected \`=\`\n`,
          ),
        ),
        codexStatus(finished(2, "Not logged in\n")),
        codexStatus(finished(1, "")),
      ],
      ["signed-in", "signed-out", "unknown", "unknown", "unknown"],
    );
  });

  it("reads a probe that a signal killed as unknown, whatever its output says", () => {
    assert.deepEqual(
      [
        codexStatus(finished(null, "Not logged in\n")),
        signInFrom(finished(null, "", "You are not authenticated.\n"), ({ stdout }) =>
          signInOf(stdout),
        ),
        signInFrom(finished(null, "", "You are logged in with grok.com.\n"), ({ stdout }) =>
          signInOf(stdout),
        ),
      ],
      ["unknown", "unknown", "unknown"],
    );
  });
});
