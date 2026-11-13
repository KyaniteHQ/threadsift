import { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";

import { z } from "zod";

import { AiSettingsViewSchema } from "../src/core/ai-contract.ts";
import {
  ItemDetailResponseSchema,
  ItemListResponseSchema,
  SavedItemResponseSchema,
  SessionStateSchema,
} from "../src/http/schemas.ts";
import { CommandFailure } from "./command-failure.ts";
import { DEPLOYMENT_INPUT, suppliedDigestMatches } from "./deployment-input.ts";
import { deploymentPassword } from "./deployment-password.ts";
import { type DeploymentRun, deploymentRun } from "./deployment-report.ts";
import { type InstanceApi, openInstanceApi, signIn, signOut } from "./instance-api.ts";

const [address, directory, digestMode = "provider"] = process.argv.slice(2);
const mode = z.enum(["provider", "supplied"]).parse(digestMode);
const origin = new URL(z.url().parse(address));
const artifact = resolve(z.string().min(1).parse(directory));

function validateOrigin(): void {
  if (process.env["CI"] !== undefined || process.env["GITHUB_ACTIONS"] !== undefined)
    throw new CommandFailure({
      kind: "check",
      reason: "Run on the owner's machine",
      recovery: "Run this command outside CI on the owner's machine.",
    });

  if (
    origin.username !== "" ||
    origin.password !== "" ||
    origin.search !== "" ||
    origin.hash !== "" ||
    origin.pathname !== "/"
  )
    throw new CommandFailure({
      kind: "check",
      reason: "Supply an origin only",
      recovery: "Use an Instance origin without credentials, path, query or fragment.",
    });

  if (
    origin.protocol !== "https:" &&
    !(origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))
  )
    throw new CommandFailure({
      kind: "check",
      reason: "Use HTTPS or loopback HTTP",
      recovery: "Use HTTPS for a deployed Instance or HTTP on loopback.",
    });
}

async function run(api: InstanceApi, report: DeploymentRun): Promise<void> {
  validateOrigin();

  const credential = deploymentPassword();

  report.enter("sign-in");
  await signIn(api, credential, {
    reason: "Sign-in failed",
    recovery: "Check the owner password and any sign-in lock before running again.",
  });
  report.markSignedIn();
  const session = await api.get("/api/session");

  if (SessionStateSchema.parse(await session.json()).state !== "signed-in")
    throw new CommandFailure({
      kind: "http",
      status: session.status(),
      reason: "Session failed",
      recovery: "Check that the Instance accepts and retains its session cookie.",
    });
  report.record("passed");
  report.enter("provider");
  const settings = await api.get("/api/settings/ai");

  if (mode === "provider" && AiSettingsViewSchema.parse(await settings.json()).settings === null)
    throw new CommandFailure({
      kind: "check",
      reason: "Configure a Provider before running",
      recovery: "Save a working Provider in Instance settings, or select supplied mode.",
    });
  report.record(mode === "provider" ? "existing configuration retained" : "not exercised");
  const created = await paste(api, report);
  report.enter("Queue and Digest");
  await waitForDigest(api, created, Date.now() + 600_000);
  report.record(
    mode === "provider"
      ? "real fetch and configured Provider Digest passed"
      : "real fetch and caller-supplied Digest publication passed; Provider unproven",
  );
}

async function paste(api: InstanceApi, report: DeploymentRun): Promise<number> {
  report.enter("Paste");
  const { url } = DEPLOYMENT_INPUT;
  const existing = await api.get("/api/items", { params: { url } });

  if (ItemListResponseSchema.parse(await existing.json()).items.length > 0)
    throw new CommandFailure({
      kind: "check",
      reason: "Check URL already exists",
      recovery: "Run again to generate a different check URL.",
    });

  const saved = await api.post("/api/items", {
    data: mode === "provider" ? { url } : { url, digest: DEPLOYMENT_INPUT.digest },
  });

  if (saved.status() !== 201)
    throw new CommandFailure({
      kind: "http",
      status: saved.status(),
      reason: "Paste did not create a new Item; no Item will be deleted",
      recovery: "Inspect the check URL in the library; no existing Item is owned by this run.",
    });
  const id = SavedItemResponseSchema.parse(await saved.json()).item.id;
  report.own(id);
  report.record(`created Item ${String(id)}`);

  return id;
}

async function waitForDigest(api: InstanceApi, id: number, deadline: number): Promise<void> {
  const answer = await api.get(`/api/items/${String(id)}`);
  const { item } = ItemDetailResponseSchema.parse(await answer.json());

  if (item.status === "failed" || item.digestOutcome === "failed")
    throw new CommandFailure({
      kind: "check",
      reason: "Item processing failed",
      recovery: "Inspect the check Item and its processing failure in the Instance.",
    });

  if (
    item.status === "ready" &&
    item.fetch === "ok" &&
    item.postText !== null &&
    item.digest !== null
  ) {
    if (mode === "supplied" && !suppliedDigestMatches(item))
      throw new CommandFailure({
        kind: "check",
        reason: "Supplied Digest differs from the published Digest",
        recovery: "Check caller-supplied Digest publication on the Instance before running again.",
      });

    return;
  }

  if (Date.now() >= deadline)
    throw new CommandFailure({
      kind: "check",
      reason: "Queue or Digest timed out",
      recovery: "Check the Instance Queue and configured Provider, then run again.",
    });
  await setTimeout(2000);
  await waitForDigest(api, id, deadline);
}

async function deleteOwnedItem(
  api: InstanceApi,
  report: DeploymentRun,
  owned: number,
): Promise<void> {
  const deleted = await api.delete(`/api/items/${String(owned)}`);
  const absent = await api.get(`/api/items/${String(owned)}`);

  if (deleted.status() !== 204 || absent.status() !== 404)
    throw new CommandFailure({
      kind: "http",
      status: deleted.status() === 204 ? absent.status() : deleted.status(),
      reason: "Check Item cleanup failed",
      recovery: "Inspect the recorded Item id and remove that check Item if it remains.",
    });
  report.record(`only new Item ${String(owned)} was deleted`);
}

async function cleanup(api: InstanceApi, report: DeploymentRun): Promise<void> {
  report.enter("cleanup");

  const owned = report.owned();

  if (owned !== undefined) {
    try {
      await deleteOwnedItem(api, report, owned);
    } catch (error) {
      report.fail(
        error instanceof CommandFailure
          ? error.failure
          : {
              kind: "check",
              reason: "Check Item cleanup request failed",
              recovery: "Inspect the recorded Item id and remove that check Item if it remains.",
            },
      );
    }
  }

  report.enter("sign-out");

  if (report.signedIn()) {
    try {
      await signOut(api, {
        reason: "Sign-out failed",
        recovery: "Change the owner password in Settings to end other sessions.",
      });
    } catch (error) {
      report.fail(
        error instanceof CommandFailure
          ? error.failure
          : {
              kind: "check",
              reason: "Check session cleanup request failed",
              recovery: "Change the owner password in Settings to end other sessions.",
            },
      );
    }
  }
}

async function main(): Promise<void> {
  const report = deploymentRun(artifact, mode);
  const api = await openInstanceApi(origin.origin);

  try {
    await run(api, report);
  } catch (error) {
    report.fail(
      error instanceof CommandFailure
        ? error.failure
        : {
            kind: "check",
            reason: "Invalid configuration, response or transport failure",
            recovery:
              "Check the command arguments and Instance availability, then inspect the recorded stage.",
          },
    );
  } finally {
    await cleanup(api, report);
    await api.dispose();
  }

  if (process.exitCode !== 1) console.log("Deployment check passed; see result.json");
}

await main();
