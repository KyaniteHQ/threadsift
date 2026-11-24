import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ToolRepository } from "./tool-repository.ts";

const layoutOf = (
  {
    entries,
    testEntries = {},
  }: Readonly<{
    entries: Record<string, readonly string[]>;
    testEntries?: Record<string, readonly string[]>;
  }>,
  extra: readonly string[] = [],
) => {
  const unlisted = Object.fromEntries(["alpha", "beta", ...extra].map((name) => [name, []]));

  return JSON.stringify({
    order: ["contract", "kernel", "alpha", "beta", ...extra, "compose"],
    entries: { ...unlisted, ...entries },
    testEntries: { ...unlisted, ...testEntries },
  });
};

const MODULE = "export const value = 1;\n";

const SOUND = {
  "tools/core-layout.json": layoutOf({
    entries: { beta: ["entry.ts"] },
    testEntries: { alpha: ["probe.ts"] },
  }),
  "src/core/contract/shape.ts": MODULE,
  "src/features/alpha/core/base.ts": MODULE,
  "src/features/alpha/core/probe.ts": MODULE,
  "test/probe.test.ts":
    'import { value } from "../src/features/alpha/core/probe.ts";\nexport const probed = value;\n',
  "src/features/beta/core/entry.ts": MODULE,
  "src/features/alpha/http/route.ts":
    'import { value } from "../../beta/core/entry.ts";\nexport const route = value;\n',
};

describe("the core layout check reports a file, a list or a shared route module that the layout does not allow", () => {
  it("passes a tree whose files sit in a place of the layout and whose entries are imported", () => {
    using repository = new ToolRepository(SOUND);

    repository.commit();

    assert.deepEqual(repository.run("check-core-layout.ts"), { status: 0, stdout: "", stderr: "" });
  });

  it("names each problem, then counts them", () => {
    using repository = new ToolRepository({
      ...SOUND,
      "tools/core-layout.json": layoutOf(
        {
          entries: { alpha: ["missing.ts"], beta: ["entry.ts", "base.ts"] },
          testEntries: { beta: ["orphan.ts"] },
        },
        ["gamma"],
      ),
      "src/features/beta/core/base.ts": MODULE,
      "src/features/beta/core/orphan.ts": MODULE,
      "src/features/alpha/http/route.ts":
        'import { value } from "../../beta/core/entry.ts";\nimport { helper } from "../../../http/helper.ts";\nexport const route = [value, helper];\n',
      "src/core/stray/file.ts": MODULE,
      "src/http/helper.ts": "export const helper = 1;\n",
    });

    repository.commit();

    const { status, stderr } = repository.run("check-core-layout.ts");

    assert.equal(status, 1);
    const [misplaced = "", ...others] = stderr.split("\n");

    assert.match(
      misplaced,
      /^src\/core\/stray\/file\.ts sits where the layout has no place for it; /u,
    );
    assert.deepEqual(others, [
      "order lists gamma, and src/features/gamma/core holds no module",
      "base.ts is on the core side more than once (src/features/alpha/core/base.ts, src/features/beta/core/base.ts); a basename is unique within each side",
      "entries of alpha names missing.ts, and src/features/alpha/core/missing.ts does not exist",
      "entries of beta names base.ts, and no file of code under src/ outside src/features/beta/ imports it",
      "testEntries of beta names orphan.ts, and no file of test/, tools/ or smoke/ outside src/features/beta/ imports it",
      "src/http/helper.ts is imported only by the http half of alpha; move it to src/features/alpha/http",
      "7 layout problems (tools/core-layout.json, docs/architecture/repository-layout.md)",
      "",
    ]);
  });
});
