import { type APIRequestContext, request } from "@playwright/test";
import { z } from "zod";

import { ItemListResponseSchema } from "../src/http/schemas.ts";
import { CommandFailure } from "./command-failure.ts";

const demoLinks = [
  "https://stephango.com/saw",
  "https://matklad.github.io/2023/10/12/lsp-could-have-been-better.html",
  "https://example.com/",
];

async function openOwner(api: Readonly<Pick<APIRequestContext, "get" | "post">>): Promise<void> {
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

async function seedDemo(api: Readonly<Pick<APIRequestContext, "get" | "post">>): Promise<void> {
  await Promise.all(
    demoLinks.map(async (url) => {
      const listed = await api.get("/api/items", { params: { url } });

      if (listed.status() !== 200)
        throw new CommandFailure({
          kind: "http",
          status: listed.status(),
          reason: "Preview demo inventory failed",
          recovery: "Check the preview HTTP API and rerun deploy.",
        });

      const { items } = ItemListResponseSchema.parse(await listed.json());

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

async function signOut(api: Readonly<Pick<APIRequestContext, "get" | "post">>): Promise<void> {
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
