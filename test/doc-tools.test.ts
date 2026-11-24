import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ToolRepository } from "./tool-repository.ts";

const SOURCE = "export const helper = 1;\nexport const other = 2;\n";

describe("the doc reference check reports each doc line that names a missing path, a line past the end or a symbol the file lacks", () => {
  it("passes a doc whose paths, line ranges and symbols exist, and skips a line marked not built", () => {
    using repository = new ToolRepository({
      "src/real.ts": SOURCE,
      "docs/guide.md": [
        "# Guide",
        "",
        "`src/real.ts` holds the helper.",
        "`src/real.ts:1-2` is the whole file.",
        "`helper` in `src/real.ts` is the entry.",
        "`src/later.ts` is not built yet.",
        "",
      ].join("\n"),
    });

    repository.commit();

    assert.deepEqual(repository.run("doc-refs.ts"), { status: 0, stdout: "", stderr: "" });
  });

  it("names the doc, the line and the reason for each broken reference, then counts them", () => {
    using repository = new ToolRepository({
      "src/real.ts": SOURCE,
      "docs/broken.md": [
        "# Broken",
        "",
        "`src/gone.ts` was removed.",
        "`src/real.ts:1-9` is longer than the file.",
        "`src/real.ts:1-3` ends one line past the file.",
        "`src/real.ts:0-1` starts before line 1.",
        "`src/real.ts:2-1` ends before it starts.",
        "`ghost` in `src/real.ts` is not there.",
        "`src/later.ts` is not built yet.",
        "",
      ].join("\n"),
    });

    repository.commit();

    const { status, stderr } = repository.run("doc-refs.ts");

    assert.equal(status, 1);
    assert.deepEqual(stderr.split("\n"), [
      "docs/broken.md:3: `src/gone.ts` does not exist",
      "docs/broken.md:4: `src/real.ts:1-9` names lines 1-9, and src/real.ts has 2 lines",
      "docs/broken.md:5: `src/real.ts:1-3` names lines 1-3, and src/real.ts has 2 lines",
      "docs/broken.md:6: `src/real.ts:0-1` names lines 0-1, and src/real.ts has 2 lines",
      "docs/broken.md:7: `src/real.ts:2-1` names lines 2-1, and src/real.ts has 2 lines",
      "docs/broken.md:8: `ghost` does not appear in src/real.ts",
      "6 broken doc references",
      "",
    ]);
  });
});

describe("the doc impact check lists each doc line that names a path or an export that changed since a revision", () => {
  const GUIDE = [
    "`src/changed.ts` holds the entry.",
    "`src/untouched.ts` is not edited.",
    "`oldName` was exported by the helper.",
    "`docs/other.md` is another page.",
    "`src/moved.ts` is the old place.",
    "`src/fresh.ts` is new.",
    "`stays` is still exported by the helper.",
    "`src/reverted.ts` was edited and put back.",
    "",
  ].join("\n");

  const withHistory = () =>
    new ToolRepository({
      "src/changed.ts": "export const changed = 1;\n",
      "src/untouched.ts": "export const untouched = 1;\n",
      "src/helper.ts": "export const oldName = 1;\nexport const stays = 2;\n",
      "src/moved.ts": "export const moved = 1;\n",
      "src/reverted.ts": "export const reverted = 1;\n",
      "docs/other.md": "One line.\n",
      "docs/guide.md": GUIDE,
    });

  it("names a changed path, a removed export, a moved path and a path put back after a commit, and leaves out an edited page, a kept export and an untouched path", () => {
    using repository = withHistory();

    const base = repository.commit();

    repository.move("src/moved.ts", "src/renamed.ts");
    repository.commit({
      "src/changed.ts": "export const changed = 2;\n",
      "src/helper.ts": "export const stays = 2;\n",
      "docs/other.md": "Another line.\n",
      "src/reverted.ts": "export const reverted = 2;\n",
    });
    repository.write({
      "src/fresh.ts": "export const fresh = 1;\n",
      "src/reverted.ts": "export const reverted = 1;\n",
    });

    assert.deepEqual(repository.run("docs-impact.ts", base), {
      status: 0,
      stdout: [
        "docs/guide.md:1: names src/changed.ts",
        "docs/guide.md:3: names oldName",
        "docs/guide.md:5: names src/moved.ts",
        "docs/guide.md:6: names src/fresh.ts",
        "docs/guide.md:8: names src/reverted.ts",
        "",
      ].join("\n"),
      stderr: "",
    });
  });

  it("says that no doc line is affected when nothing changed since the revision", () => {
    using repository = withHistory();

    const base = repository.commit();

    assert.deepEqual(repository.run("docs-impact.ts", base), {
      status: 0,
      stdout: `No doc line names a path or an export that changed since ${base}.\n`,
      stderr: "",
    });
  });

  it("fails with the reason when the revision does not exist", () => {
    using repository = withHistory();

    repository.commit();

    const { status, stdout, stderr } = repository.run("docs-impact.ts", "no-such-revision");

    assert.equal(status, 1);
    assert.equal(stdout, "");
    assert.match(stderr, /^docs:impact could not compare with no-such-revision: /u);
  });
});
