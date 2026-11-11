import { setTimeout } from "node:timers/promises";

import { type APIRequestContext, request } from "@playwright/test";
import { z } from "zod";

import { ItemListResponseSchema } from "../src/http/schemas.ts";
import { CommandFailure } from "./command-failure.ts";
import { demoDigestPastes, seedDemoProposals } from "./preview-demo.ts";

const demoPastes = [
  { url: "https://stephango.com/saw" },
  { url: "https://matklad.github.io/2023/10/12/lsp-could-have-been-better.html" },
  { url: "https://matklad.github.io/2022/04/25/why-lsp.html" },
  { url: "https://example.com/" },
  ...demoDigestPastes,
];

const READ_ATTEMPTS = 11;
const READ_PAUSE_MS = 5000;
const DIGEST_ATTEMPTS = 24;

type Api = Readonly<Pick<APIRequestContext, "get" | "post">>;

async function demoItems(api: Api, url: string, attempt = 1) {
  const response = await api.get("/api/items", { params: { url } });
  const status = response.status();

  if (status === 200) return ItemListResponseSchema.parse(await response.json()).items;

  if (attempt < READ_ATTEMPTS && (status === 404 || status >= 500)) {
    await setTimeout(READ_PAUSE_MS);

    return demoItems(api, url, attempt + 1);
  }

  throw new CommandFailure({
    kind: "http",
    status,
    reason: "Preview demo inventory failed",
    recovery: "Check the preview HTTP API and rerun deploy.",
  });
}

async function openOwner(api: Api): Promise<void> {
  const code = z.string().min(16).parse(process.env["PREVIEW_SETUP_CODE"]);
  const password = z.string().min(15).parse(process.env["DEMO_OWNER_PASSWORD"]);
  const setup = await api.post("/api/setup", { data: { code, password } });

  if (setup.status() === 204) return;

  if (setup.status() === 409)
    z.object({ code: z.literal("owner-exists") }).parse(await setup.json());
  else
    throw new CommandFailure({
      kind: "http",
      status: setup.status(),
      reason: "Preview owner provisioning failed",
      recovery: "Check setup credentials, migrations and Worker readiness, then rerun deploy.",
    });

  const signedIn = await api.post("/api/login", { data: { password } });

  if (signedIn.status() !== 204)
    throw new CommandFailure({
      kind: "http",
      status: signedIn.status(),
      reason: "Preview owner sign-in failed",
      recovery: "Restore the preview owner's saved password, then rerun deploy.",
    });
}

function hasDigest(item: Awaited<ReturnType<typeof demoItems>>[number] | undefined): boolean {
  return item !== undefined && item.digestTitle !== null;
}

async function awaitDigest(api: Api, url: string, attempt = 1): Promise<void> {
  const [item] = await demoItems(api, url);

  if (hasDigest(item)) return;

  if (item?.digestOutcome === "failed" || attempt >= DIGEST_ATTEMPTS)
    throw new CommandFailure({
      kind: "check",
      reason: "Preview demo Digest did not publish",
      recovery: "Check the preview Queue and fetch jobs, then rerun deploy.",
    });

  await setTimeout(READ_PAUSE_MS);

  return awaitDigest(api, url, attempt + 1);
}

async function seedDemo(api: Api): Promise<void> {
  await Promise.all(
    demoPastes.map(async (data) => {
      const [item] = await demoItems(api, data.url);

      if (item !== undefined && (!("digest" in data) || hasDigest(item))) return;

      const saved = await api.post("/api/items", { data });

      if (saved.status() !== 201 && saved.status() !== 200)
        throw new CommandFailure({
          kind: "http",
          status: saved.status(),
          reason: "Preview demo Paste failed",
          recovery: "Check the preview HTTP API and rerun deploy; existing Items are retained.",
        });
    }),
  );

  await Promise.all(demoDigestPastes.map(({ url }) => awaitDigest(api, url)));
}

async function signOut(api: Api): Promise<void> {
  const ended = await api.post("/api/logout");

  if (ended.status() !== 204)
    throw new CommandFailure({
      kind: "http",
      status: ended.status(),
      reason: "Preview setup session cleanup failed",
      recovery:
        "Delete and recreate this disposable preview to end its sessions, then rerun deploy.",
    });
}

export async function provisionPreviewOwner(
  origin: string,
  wrangler: (args: readonly string[]) => string,
): Promise<void> {
  const api = await request.newContext({
    baseURL: origin,
    timeout: 30_000,
    maxRedirects: 0,
    extraHTTPHeaders: { Origin: origin },
  });

  try {
    await openOwner(api);

    try {
      await seedDemo(api);
    } finally {
      await signOut(api);
    }
  } finally {
    await api.dispose();
  }

  seedDemoProposals(wrangler, ["--remote"]);
}
