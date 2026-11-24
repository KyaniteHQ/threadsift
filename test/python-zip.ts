import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempDisposableSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PYTHON_LISTING = [
  "import sys, zipfile",
  "names = zipfile.ZipFile(sys.argv[1]).namelist()",
  "print(len(names), names[-1])",
].join("\n");

export function listedByPython(zip: Uint8Array): string {
  using folder = mkdtempDisposableSync(join(tmpdir(), "threadsift-zip-"));

  const file = join(folder.path, "many.zip");

  writeFileSync(file, zip);

  const run = spawnSync("python3", ["-I", "-c", PYTHON_LISTING, file], {
    encoding: "utf8",
    env: { PATH: process.env["PATH"] ?? "" },
  });

  assert.equal(run.status, 0, run.stderr);

  return run.stdout.trim();
}
