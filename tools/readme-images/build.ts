import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { keepHighlights } from "./capture.ts";
import { startInstance } from "./instance.ts";
import { renderAll } from "./render.ts";
import { seedLibrary } from "./seed.ts";
import { startStubProvider } from "./stub-provider.ts";

const ROOT = join(import.meta.dirname, "..", "..");

const ASSETS = join(ROOT, "docs", "assets");

const INSTANCE_PORT = 5430;

const PROVIDER_PORT = 5431;

execFileSync("pnpm", ["run", "build"], { cwd: ROOT, stdio: "inherit" });
mkdirSync(ASSETS, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), "threadsift-readme-raw-"));
const provider = await startStubProvider(PROVIDER_PORT);
const instance = await startInstance(ROOT, INSTANCE_PORT);

try {
  const ids = await seedLibrary(instance, provider);

  await keepHighlights(instance, ids);
  await renderAll(instance, ids, scratch, ASSETS);
} finally {
  await instance.stop();
  await provider.stop();
  rmSync(scratch, { recursive: true, force: true });
}
