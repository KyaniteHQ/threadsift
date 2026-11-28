import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { requireDaysInYear } from "./clock.ts";
import { requireMagick } from "./frame.ts";
import { produce } from "./produce.ts";
import { resources } from "./resources.ts";

const ROOT = join(import.meta.dirname, "..", "..");

const ASSETS = join(ROOT, "docs", "assets");

requireMagick();
requireDaysInYear();
execFileSync("pnpm", ["run", "build"], { cwd: ROOT, stdio: "inherit" });

const held = resources();

try {
  const scratch = held.own(mkdtempSync(join(tmpdir(), "threadsift-readme-images-")), (folder) => {
    rmSync(folder, { recursive: true, force: true });

    return Promise.resolve();
  });
  const out = join(scratch, "out");

  mkdirSync(out);
  await produce(ROOT, scratch, out, held);
  mkdirSync(ASSETS, { recursive: true });
  for (const name of readdirSync(out)) copyFileSync(join(out, name), join(ASSETS, name));
} finally {
  await held.releaseAll();
}
