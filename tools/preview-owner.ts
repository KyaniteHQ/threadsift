import { setTimeout } from "node:timers/promises";

import { type APIRequestContext, request } from "@playwright/test";
import { z } from "zod";

import { SaveItemRequestSchema } from "../src/http/save-schemas.ts";
import { type Item, ItemListResponseSchema } from "../src/http/schemas.ts";
import { CommandFailure } from "./command-failure.ts";
import { demoDigestPastes, seedDemoProposals } from "./preview-demo.ts";

type Paste = Pick<z.input<typeof SaveItemRequestSchema>, "digest" | "page" | "url">;

const demoPastes: readonly Paste[] = [
  { url: "https://stephango.com/saw" },
  { url: "https://matklad.github.io/2023/10/12/lsp-could-have-been-better.html" },
  { url: "https://matklad.github.io/2022/04/25/why-lsp.html" },
  { url: "https://example.com/" },
  ...demoDigestPastes,
];

const READ_ATTEMPTS = 11;
const READ_PAUSE_MS = 5000;
const DIGEST_WAIT_MS = 120_000;

type Api = Readonly<Pick<APIRequestContext, "get" | "post">>;

async function readItems(api: Api, url: string): Promise<readonly Item[] | null> {
  const response = await api.get("/api/items", { params: { url } });
  const status = response.status();

  if (status === 200) return ItemListResponseSchema.parse(await response.json()).items;

  if (status === 404 || status >= 500) return null;

  throw new CommandFailure({
    kind: "http",
    status,
    reason: "Preview demo inventory failed",
    recovery: "Check the preview HTTP API and rerun deploy.",
  });
}

async function demoItems(api: Api, url: string, attempt = 1): Promise<readonly Item[]> {
  const items = await readItems(api, url);

  if (items !== null) return items;

  if (attempt >= READ_ATTEMPTS)
    throw new CommandFailure({
      kind: "http",
      status: 503,
      reason: "Preview demo inventory failed",
      recovery: "Check the preview HTTP API and rerun deploy.",
    });

  await setTimeout(READ_PAUSE_MS);

  return demoItems(api, url, attempt + 1);
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

function hasDigest(item: Item | undefined): boolean {
  return item !== undefined && item.digestTitle !== null;
}

async function awaitDigest(api: Api, url: string, deadline: number): Promise<void> {
  const [item] = (await readItems(api, url)) ?? [];

  if (hasDigest(item)) return;

  if (item?.status === "failed" || Date.now() >= deadline)
    throw new CommandFailure({
      kind: "check",
      reason: "Preview demo Digest did not publish",
      recovery: "Check the preview Queue and fetch jobs, then rerun deploy.",
    });

  await setTimeout(READ_PAUSE_MS);

  return awaitDigest(api, url, deadline);
}

async function seedDemo(api: Api): Promise<void> {
  await Promise.all(
    demoPastes.map(async (data) => {
      const [item] = await demoItems(api, data.url);

      if (item !== undefined && (data.digest === undefined || hasDigest(item))) return;

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

  const deadline = Date.now() + DIGEST_WAIT_MS;

  await Promise.all(demoDigestPastes.map(({ url }) => awaitDigest(api, url, deadline)));
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
