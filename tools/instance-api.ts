import { type APIRequestContext, request } from "@playwright/test";

import { CommandFailure } from "./command-failure.ts";

export type InstanceApi = Readonly<Pick<APIRequestContext, "delete" | "get" | "post">>;

type SessionFailure = Readonly<{ reason: string; recovery: string }>;

export function openInstanceApi(origin: string): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: origin,
    timeout: 30_000,
    maxRedirects: 0,
    extraHTTPHeaders: { Origin: origin },
  });
}

export async function signIn(
  api: InstanceApi,
  password: string,
  failure: SessionFailure,
): Promise<void> {
  const login = await api.post("/api/login", { data: { password } });

  if (login.status() !== 204)
    throw new CommandFailure({ kind: "http", status: login.status(), ...failure });
}

export async function signOut(api: InstanceApi, failure: SessionFailure): Promise<void> {
  const logout = await api.post("/api/logout");

  if (logout.status() !== 204)
    throw new CommandFailure({ kind: "http", status: logout.status(), ...failure });
}
