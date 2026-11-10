import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
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

const [address, directory, digestMode = "provider"] = process.argv.slice(2);
const mode = z.enum(["provider", "supplied"]).parse(digestMode);
const origin = new URL(z.url().parse(address));
const artifact = resolve(z.string().min(1).parse(directory));
const results: { stage: string; result: string }[] = [];
let stage = "configuration";

function record(result: string): void {
  results.push({ stage, result });
  writeFileSync(`${artifact}/result.json`, JSON.stringify({ mode, results }, null, 2), {
    mode: 0o600,
  });
}

function password(): string {
  const file = process.env["THREADSIFT_PASSWORD_FILE"];

  if (file === undefined) return z.string().min(1).parse(process.env["THREADSIFT_PASSWORD"]);

  if ((statSync(file).mode & 0o077) !== 0) throw new Error("Password file must be private");

  return z
    .string()
    .min(1)
    .parse(readFileSync(file, "utf8").replace(/\r?\n$/u, ""));
}

function validateOrigin(): void {
  if (process.env["CI"] !== undefined || process.env["GITHUB_ACTIONS"] !== undefined)
    throw new Error("Run on the owner's machine");

  if (
    origin.username !== "" ||
    origin.password !== "" ||
    origin.search !== "" ||
    origin.hash !== "" ||
    origin.pathname !== "/"
  )
    throw new Error("Supply an origin only");

  if (
    origin.protocol !== "https:" &&
    !(origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))
  )
    throw new Error("Use HTTPS or loopback HTTP");
}

const api = await request.newContext({
  baseURL: origin.origin,
  timeout: 30_000,
  maxRedirects: 0,
  extraHTTPHeaders: { Origin: origin.origin },
});

async function run(): Promise<void> {
  validateOrigin();

  const credential = password();

  let owned: number | undefined;
  let signedIn = false;

  try {
    stage = "sign-in";
    const login = await api.post("/api/login", { data: { password: credential } });

    if (login.status() !== 204) throw new Error("Sign-in failed");
    signedIn = true;
    const session = await api.get("/api/session");

    if (SessionStateSchema.parse(await session.json()).state !== "signed-in")
      throw new Error("Session failed");
    record("passed");
    stage = "provider";
    const settings = await api.get("/api/settings/ai");

    if (mode === "provider" && AiSettingsViewSchema.parse(await settings.json()).settings === null)
      throw new Error("Configure a Provider before running");
    record(mode === "provider" ? "existing configuration retained" : "not exercised");
    owned = await paste();
    stage = "Queue and Digest";
    await waitForDigest(owned, Date.now() + 600_000);
    record(
      mode === "provider"
        ? "real fetch and configured Provider Digest passed"
        : "real fetch and caller-supplied Digest publication passed; Provider unproven",
    );
  } finally {
    const failedStage = stage;

    stage = "cleanup";
    await cleanup(owned, signedIn);
    stage = failedStage;
  }
}

async function paste(): Promise<number> {
  stage = "Paste";
  const url = new URL("https://www.sqlite.org/whentouse.html");

  url.searchParams.set("threadsift-check", randomUUID());
  const existing = await api.get("/api/items", { params: { url: url.href } });

  if (ItemListResponseSchema.parse(await existing.json()).items.length > 0)
    throw new Error("Check URL already exists");

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
    throw new Error("Paste did not create a new Item; no Item will be deleted");
  const owned = SavedItemResponseSchema.parse(await saved.json()).item.id;
  record(`created Item ${String(owned)}`);

  return owned;
}

async function waitForDigest(id: number, deadline: number): Promise<void> {
  const answer = await api.get(`/api/items/${String(id)}`);
  const { item } = ItemDetailResponseSchema.parse(await answer.json());

  if (item.status === "failed" || item.digestOutcome === "failed")
    throw new Error("Item processing failed");

  if (
    item.status === "ready" &&
    item.fetch === "ok" &&
    item.postText !== null &&
    item.digest !== null
  )
    return;

  if (Date.now() >= deadline) throw new Error("Queue or Digest timed out");
  await setTimeout(2000);
  await waitForDigest(id, deadline);
}

async function cleanup(owned: number | undefined, signedIn: boolean): Promise<void> {
  try {
    if (owned !== undefined) {
      const deleted = await api.delete(`/api/items/${String(owned)}`);
      const absent = await api.get(`/api/items/${String(owned)}`);

      if (deleted.status() !== 204 || absent.status() !== 404) throw new Error("Cleanup failed");
      record(`only new Item ${String(owned)} was deleted`);
    }
  } finally {
    if (signedIn) {
      await signOut();
    }
  }
}

async function signOut(): Promise<void> {
  const logout = await api.post("/api/logout");

  if (logout.status() !== 204) throw new Error("Sign-out failed");
}

mkdirSync(artifact, { recursive: true, mode: 0o700 });

try {
  await run();
  console.log("Deployment check passed; see result.json");
} catch {
  record("failed; response bodies and credentials were not recorded");
  console.error(`Deployment check failed at ${stage}; see result.json`);
  process.exitCode = 1;
} finally {
  await api.dispose();
}
