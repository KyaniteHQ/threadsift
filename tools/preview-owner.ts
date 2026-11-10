import { request } from "@playwright/test";
import { z } from "zod";

import { CommandFailure } from "./command-failure.ts";

export async function provisionPreviewOwner(origin: string): Promise<void> {
  const code = z.string().min(16).parse(process.env["PREVIEW_SETUP_CODE"]);
  const password = z.string().min(15).parse(process.env["DEMO_OWNER_PASSWORD"]);

  const api = await request.newContext({
    baseURL: origin,
    timeout: 30_000,
    maxRedirects: 0,
    extraHTTPHeaders: { Origin: origin },
  });

  try {
    const response = await api.post("/api/setup", { data: { code, password } });

    if (response.status() === 409) {
      z.object({ code: z.literal("owner-exists") }).parse(await response.json());

      return;
    }

    if (response.status() !== 204)
      throw new CommandFailure({
        kind: "http",
        status: response.status(),
        reason: "Preview owner provisioning failed",
        recovery: "Check setup credentials, migrations and Worker readiness, then rerun deploy.",
      });

    const ended = await api.post("/api/logout");

    if (ended.status() !== 204)
      throw new CommandFailure({
        kind: "http",
        status: ended.status(),
        reason: "Preview setup session cleanup failed",
        recovery: "End the setup session in Instance settings and rerun deploy.",
      });
  } finally {
    await api.dispose();
  }
}
