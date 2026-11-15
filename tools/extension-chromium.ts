import { randomBytes } from "node:crypto";

import { z } from "zod";

import { GROUPS, runChecks } from "./extension-chromium/all-checks.ts";
import { openSession } from "./extension-chromium/browser.ts";
import { freePort, startInstance } from "./extension-chromium/instance.ts";
import { allResults, failures } from "./extension-chromium/report.ts";
import { startStandIn } from "./extension-chromium/stand-in.ts";

const selected = z.array(z.enum(GROUPS)).parse(process.argv.slice(2));
const redditSession = `run.${randomBytes(12).toString("hex")}_not-real`;
const instance = await startInstance();
const standIn = await startStandIn(await freePort());

try {
  const { session, chromium } = await openSession(instance, standIn.port, redditSession);

  try {
    process.stdout.write(`Chromium ${chromium}, Instance ${instance.origin}\n`);
    await runChecks({ session, instance, standIn, redditSession }, selected);
  } finally {
    await session.cleanup();
  }
} finally {
  await standIn.close();
  instance.stop();
}

const total = allResults().length;

process.stdout.write(`\n${total - failures()} passed, ${failures()} failed\n`);

process.exitCode = failures() === 0 ? 0 : 1;
