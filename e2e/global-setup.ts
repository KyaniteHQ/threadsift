import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import {
  OWNER_STATE_FILE,
  PASSWORD_FILE,
  TOKEN_FILE,
  newPassword,
  sessionStateOf,
  sessionValueOf,
  stateDir,
} from "./access.ts";
import { envValue } from "./env.ts";

const CreatedSchema = z.object({ value: z.string() });

function keep(name: string, content: string): void {
  writeFileSync(join(stateDir(), name), content, { mode: 0o600 });
}

export default async function globalSetup(): Promise<void> {
  const baseURL = envValue("THREADSIFT_BASE_URL");
  const password = newPassword();

  const setup = await fetch(new URL("/api/setup", baseURL), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: envValue("THREADSIFT_SETUP_CODE"), password }),
  });

  if (setup.status !== 204) {
    throw new Error(`POST /api/setup answered ${setup.status}`);
  }

  const session = sessionValueOf(setup.headers.getSetCookie().join("\n"));
  const state = sessionStateOf(session, baseURL);

  const created = await fetch(new URL("/api/tokens", baseURL), {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `${state.cookies[0]?.name}=${session}` },
    body: JSON.stringify({ name: "Suite" }),
  });

  if (created.status !== 201) {
    throw new Error(`POST /api/tokens answered ${created.status}`);
  }

  keep(OWNER_STATE_FILE, JSON.stringify(state));
  keep(PASSWORD_FILE, JSON.stringify({ password }));
  keep(TOKEN_FILE, JSON.stringify(CreatedSchema.parse(await created.json())));
}
