import { join } from "node:path";

import { chromium } from "@playwright/test";
import { z } from "zod";

import { TEXT } from "../extension/lib/text.ts";

const WORKER_START_MS = 15_000;
const PAGE_DRAW_MS = 10_000;

const PAGES = [
  { file: "options.html", role: "button", name: TEXT.saveSettings },
  { file: "popup.html", role: "heading", name: "Threadsift" },
] as const;

const ManifestSchema = z.object({ version: z.string().min(1) });

class ChromeCheckFailed extends Error {}

export async function loadInChromium(folder: string, version: string, work: string): Promise<void> {
  const context = await chromium.launchPersistentContext(join(work, "chromium-profile"), {
    channel: "chromium",
    args: [`--disable-extensions-except=${folder}`, `--load-extension=${folder}`],
  });

  try {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker", { timeout: WORKER_START_MS }));
    const loaded = ManifestSchema.parse(
      await worker.evaluate<unknown>("chrome.runtime.getManifest()"),
    ).version;

    if (loaded !== version) {
      throw new ChromeCheckFailed(`Chromium loaded version ${loaded}, not ${version}`);
    }

    const problems = await Promise.all(
      PAGES.map(async ({ file, role, name }) => {
        const tab = await context.newPage();
        const found: string[] = [];

        tab.on("pageerror", (error) => found.push(`${file} threw ${error.message}`));
        tab.on("requestfailed", (request) => found.push(`${file} could not load ${request.url()}`));
        await tab.goto(new URL(file, worker.url()).href, { waitUntil: "load" });

        const drawn = await tab
          .getByRole(role, { name, exact: true })
          .waitFor({ timeout: PAGE_DRAW_MS })
          .then(() => true)
          .catch(() => false);

        if (!drawn) found.push(`${file} drew no ${role} named "${name}"`);

        await tab.close();

        return found;
      }),
    );

    if (problems.flat().length > 0) throw new ChromeCheckFailed(problems.flat().join("; "));
  } finally {
    await context.close();
  }

  process.stdout.write(
    `Chromium loaded the Chrome zip: the worker started, version ${version}, and ${PAGES.map(({ file, role, name }) => `${file} drew its ${role} "${name}"`).join(" and ")}\n`,
  );
}
