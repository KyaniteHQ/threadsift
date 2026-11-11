import { setTimeout } from "node:timers/promises";

import { type APIRequestContext, request } from "@playwright/test";
import { z } from "zod";

import { AiSaveResponseSchema, AiSettingsViewSchema } from "../src/core/ai-contract.ts";
import { ItemListResponseSchema } from "../src/http/schemas.ts";
import { CommandFailure } from "./command-failure.ts";

const demoLinks = [
  "https://stephango.com/saw",
  "https://matklad.github.io/2023/10/12/lsp-could-have-been-better.html",
  "https://matklad.github.io/2022/04/25/why-lsp.html",
  "https://example.com/",
];

const demoProvider = {
  provider: "workers-ai",
  model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
} as const;

const READ_ATTEMPTS = 11;
const READ_PAUSE_MS = 5000;

type Api = Readonly<Pick<APIRequestContext, "get" | "post" | "put">>;

interface Read<Schema extends z.ZodType> {
  readonly path: string;
  readonly params: Readonly<Record<string, string>>;
  readonly schema: Schema;
  readonly reason: string;
}

async function read<Schema extends z.ZodType>(
  api: Api,
  target: Readonly<Read<Schema>>,
  attempt = 1,
): Promise<z.infer<Schema>> {
  const response = await api.get(target.path, { params: target.params });
  const status = response.status();

  if (status === 200) return target.schema.parse(await response.json());

  if (attempt < READ_ATTEMPTS && (status === 404 || status >= 500)) {
    await setTimeout(READ_PAUSE_MS);

    return read(api, target, attempt + 1);
  }

  throw new CommandFailure({
    kind: "http",
    status,
    reason: target.reason,
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

async function saveDemoProvider(api: Api): Promise<void> {
  const { settings } = await read(api, {
    path: "/api/settings/ai",
    params: {},
    schema: AiSettingsViewSchema,
    reason: "Preview Provider lookup failed",
  });

  if (settings !== null) return;

  const saved = await api.put("/api/settings/ai", { data: demoProvider });

  if (saved.status() !== 200 || "kind" in AiSaveResponseSchema.parse(await saved.json()))
    throw new CommandFailure({
      kind: "http",
      status: saved.status(),
      reason: "Preview Provider save failed",
      recovery:
        "Check that the preview Worker has the AI binding and rerun deploy; a Provider set by hand is kept.",
    });
}

async function seedDemo(api: Api): Promise<void> {
  await saveDemoProvider(api);

  await Promise.all(
    demoLinks.map(async (url) => {
      const { items } = await read(api, {
        path: "/api/items",
        params: { url },
        schema: ItemListResponseSchema,
        reason: "Preview demo inventory failed",
      });

      if (items.length > 0) return;

      const saved = await api.post("/api/items", { data: { url } });

      if (saved.status() !== 201 && saved.status() !== 200)
        throw new CommandFailure({
          kind: "http",
          status: saved.status(),
          reason: "Preview demo Paste failed",
          recovery: "Check the preview HTTP API and rerun deploy; existing Items are retained.",
        });
    }),
  );
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

export async function provisionPreviewOwner(origin: string): Promise<void> {
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
}
