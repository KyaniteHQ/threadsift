import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";

import { request } from "@playwright/test";
import { z } from "zod";

import { AiSettingsViewSchema } from "../src/core/ai-contract.ts";
import {
  ItemDetailResponseSchema,
  ItemListResponseSchema,
  SavedItemResponseSchema,
  SessionStateSchema,
} from "../src/http/schemas.ts";
import { CommandFailure, type Failure } from "./command-failure.ts";
import { deploymentPassword } from "./deployment-password.ts";

const [address, directory, digestMode = "provider"] = process.argv.slice(2);
const mode = z.enum(["provider", "supplied"]).parse(digestMode);
const origin = new URL(z.url().parse(address));
const artifact = resolve(z.string().min(1).parse(directory));

const results: (
  | { stage: string; result: "passed"; detail: string }
  | { stage: string; result: "failed"; failure: Failure }
)[] = [];

let owned: number | undefined;
let signedIn = false;
let stage = "configuration";

function record(result: string): void {
  results.push({ stage, result: "passed", detail: result });
  writeFileSync(`${artifact}/result.json`, JSON.stringify({ mode, results }, null, 2), {
    mode: 0o600,
  });
}

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

const api = await request.newContext({
  baseURL: origin.origin,
  timeout: 30_000,
  maxRedirects: 0,
  extraHTTPHeaders: { Origin: origin.origin },
});

async function run(): Promise<void> {
  validateOrigin();

  const credential = deploymentPassword();

  stage = "sign-in";
  const login = await api.post("/api/login", { data: { password: credential } });

  if (login.status() !== 204)
    throw new CommandFailure({
      kind: "http",
      status: login.status(),
      reason: "Sign-in failed",
      recovery: "Check the owner password and any sign-in lock before running again.",
    });
  signedIn = true;
  const session = await api.get("/api/session");

  if (SessionStateSchema.parse(await session.json()).state !== "signed-in")
    throw new CommandFailure({
      kind: "http",
      status: session.status(),
      reason: "Session failed",
      recovery: "Check that the Instance accepts and retains its session cookie.",
    });
  record("passed");
  stage = "provider";
  const settings = await api.get("/api/settings/ai");

  if (mode === "provider" && AiSettingsViewSchema.parse(await settings.json()).settings === null)
    throw new CommandFailure({
      kind: "check",
      reason: "Configure a Provider before running",
      recovery: "Save a working Provider in Instance settings, or select supplied mode.",
    });
  record(mode === "provider" ? "existing configuration retained" : "not exercised");
  owned = await paste();
  stage = "Queue and Digest";
  await waitForDigest(owned, Date.now() + 600_000);
  record(
    mode === "provider"
      ? "real fetch and configured Provider Digest passed"
      : "real fetch and caller-supplied Digest publication passed; Provider unproven",
  );
}

async function paste(): Promise<number> {
  stage = "Paste";
  const url = new URL("https://www.sqlite.org/whentouse.html");

  url.searchParams.set("threadsift-check", randomUUID());
  const existing = await api.get("/api/items", { params: { url: url.href } });

  if (ItemListResponseSchema.parse(await existing.json()).items.length > 0)
    throw new CommandFailure({
      kind: "check",
      reason: "Check URL already exists",
      recovery: "Run again to generate a different check URL.",
    });

  const digest = {
    title: "Deployment check",
    topic: "Deployment check",
    tags: [],
    summary: "Caller-supplied publication check.",
    keyPoints: ["This Digest proves publication without a Provider call."],
  };

  const saved = await api.post("/api/items", {
    data: mode === "provider" ? { url: url.href } : { url: url.href, digest },
  });

  if (saved.status() !== 201)
    throw new CommandFailure({
      kind: "http",
      status: saved.status(),
      reason: "Paste did not create a new Item; no Item will be deleted",
      recovery: "Inspect the check URL in the library; no existing Item is owned by this run.",
    });
  const id = SavedItemResponseSchema.parse(await saved.json()).item.id;
  record(`created Item ${String(id)}`);

  return id;
}

async function waitForDigest(id: number, deadline: number): Promise<void> {
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
  )
    return;

  if (Date.now() >= deadline)
    throw new CommandFailure({
      kind: "check",
      reason: "Queue or Digest timed out",
      recovery: "Check the Instance Queue and configured Provider, then run again.",
    });
  await setTimeout(2000);
  await waitForDigest(id, deadline);
}

async function cleanup(): Promise<void> {
  stage = "cleanup";

  if (owned !== undefined) {
    try {
      const deleted = await api.delete(`/api/items/${String(owned)}`);
      const absent = await api.get(`/api/items/${String(owned)}`);

      if (deleted.status() !== 204 || absent.status() !== 404)
        throw new CommandFailure({
          kind: "http",
          status: deleted.status() === 204 ? absent.status() : deleted.status(),
          reason: "Check Item cleanup failed",
          recovery: "Inspect the recorded Item id and remove that check Item if it remains.",
        });
      record(`only new Item ${String(owned)} was deleted`);
    } catch (error) {
      reportFailure(
        error instanceof CommandFailure
          ? error
          : new CommandFailure({
              kind: "check",
              reason: "Check Item cleanup request failed",
              recovery: "Inspect the recorded Item id and remove that check Item if it remains.",
            }),
      );
    }
  }

  stage = "sign-out";

  if (signedIn) {
    try {
      await signOut();
    } catch (error) {
      reportFailure(
        error instanceof CommandFailure
          ? error
          : new CommandFailure({
              kind: "check",
              reason: "Check session cleanup request failed",
              recovery: "End the check session in Instance settings.",
            }),
      );
    }
  }
}

function reportFailure(error: Readonly<CommandFailure>): void {
  results.push({ stage, result: "failed", failure: error.failure });
  writeFileSync(`${artifact}/result.json`, JSON.stringify({ mode, results }, null, 2), {
    mode: 0o600,
  });
  console.error(JSON.stringify({ stage, ...error.failure }));
  process.exitCode = 1;
}

async function signOut(): Promise<void> {
  const logout = await api.post("/api/logout");

  if (logout.status() !== 204)
    throw new CommandFailure({
      kind: "http",
      status: logout.status(),
      reason: "Sign-out failed",
      recovery: "End the check session in Instance settings.",
    });
}

mkdirSync(artifact, { recursive: true, mode: 0o700 });

try {
  await run();
} catch (error) {
  reportFailure(
    error instanceof CommandFailure
      ? error
      : new CommandFailure({
          kind: "check",
          reason: "Invalid configuration, response or transport failure",
          recovery:
            "Check the command arguments and Instance availability, then inspect the recorded stage.",
        }),
  );
} finally {
  await cleanup();
  await api.dispose();
}

if (process.exitCode !== 1) console.log("Deployment check passed; see result.json");
