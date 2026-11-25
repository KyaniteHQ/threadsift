import { z } from "zod";

import { pause } from "../src/core/contract/pause.ts";

export const START_DEADLINE_MS = 240_000;
const START_POLL_MS = 500;
const PASSWORD = "a measurement password of fifteen or more";
const TokenSchema = z.object({ value: z.string() });

async function answers(origin: string): Promise<boolean> {
  try {
    const response = await fetch(`${origin}/api/session`);
    await response.arrayBuffer();
    return response.status === 200;
  } catch {
    return false;
  }
}

export async function waitUntilServing(origin: string, deadline: number): Promise<void> {
  if (await answers(origin)) return;
  if (Date.now() > deadline) {
    throw new Error(`${origin} did not answer GET /api/session within ${START_DEADLINE_MS} ms`);
  }
  await pause(START_POLL_MS);
  await waitUntilServing(origin, deadline);
}

export async function ownerToken(origin: string, setupCode: string): Promise<string> {
  const headers = { "content-type": "application/json", origin };
  const setup = await fetch(`${origin}/api/setup`, {
    method: "POST",
    headers,
    body: JSON.stringify({ code: setupCode, password: PASSWORD }),
  });
  if (setup.status !== 204) throw new Error(`POST /api/setup answered ${setup.status}`);
  const cookie = setup.headers
    .getSetCookie()
    .map((line) => line.split(";")[0])
    .join("; ");
  const created = await fetch(`${origin}/api/tokens`, {
    method: "POST",
    headers: { ...headers, cookie },
    body: JSON.stringify({ name: "worker-build-cost" }),
  });
  if (created.status !== 201) throw new Error(`POST /api/tokens answered ${created.status}`);
  return TokenSchema.parse(await created.json()).value;
}
