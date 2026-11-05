import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { request } from "@playwright/test";

import { createToken, cookieHeader } from "./access-helpers.ts";
import {
  OWNER_STATE_FILE,
  PASSWORD_FILE,
  TOKEN_FILE,
  newPassword,
  sessionStateOf,
  sessionValueOf,
  stateDir,
} from "./access.ts";
import { postLink } from "./api.ts";
import { envValue } from "./env.ts";
import { setUpByApi } from "./fresh-screen.ts";

function keep(name: string, content: string): void {
  writeFileSync(join(stateDir(), name), content, { mode: 0o600 });
}

export default async function globalSetup(): Promise<void> {
  const baseURL = envValue("THREADSIFT_BASE_URL");
  const password = newPassword();
  const setCookie = await setUpByApi(baseURL, envValue("THREADSIFT_SETUP_CODE"), password);
  const session = sessionValueOf(setCookie);
  const owner = await request.newContext({ baseURL, extraHTTPHeaders: cookieHeader(session) });
  const created = await createToken(owner, "Suite");

  const titled = await postLink(owner, "https://example.com/");

  if (titled.body.fetch !== "ok" || titled.body.item.title !== "Example Domain") {
    throw new Error(
      `the suite's titled Item came back as fetch "${titled.body.fetch}" with title ${JSON.stringify(titled.body.item.title)}; example.com did not answer`,
    );
  }

  await owner.dispose();

  keep(OWNER_STATE_FILE, JSON.stringify(sessionStateOf(session, baseURL)));
  keep(PASSWORD_FILE, password);
  keep(TOKEN_FILE, created.value);
}
