import { type SQL, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";

import {
  X_API_DAY_LIMIT_MICROS,
  X_API_ITEM_LIMIT_MICROS,
  type XApiLimits,
  type XApiRefused,
  type XApiSettingsView,
  type XApiTokenInput,
  type XApiTokenState,
  type XApiVerifyResult,
  refusedXApi,
} from "../../../core/contract/x-api-contract.ts";
import { parsedJson } from "../../../core/kernel/parsed-json.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { xApiSettings } from "../../../core/kernel/schema.ts";
import { xApiGet } from "./x-api-request.ts";
import { spentOn, utcDayOf } from "./x-api-spend.ts";

export type XApiPorts = Pick<Ports, "db" | "secrets">;

type VerifyPorts = XApiPorts & Pick<Ports, "config">;

export type XApiAuth =
  | { readonly kind: "none" }
  | { readonly kind: "token"; readonly token: string }
  | { readonly kind: "unreadable" };

export interface XApiSaved {
  readonly auth: XApiAuth;
  readonly limits: XApiLimits;
}

const DEFAULT_LIMITS: XApiLimits = {
  itemLimitMicros: X_API_ITEM_LIMIT_MICROS,
  dayLimitMicros: X_API_DAY_LIMIT_MICROS,
};

const NONE: XApiAuth = { kind: "none" };

const CreditsSchema = z.object({ data: z.object({ total_balance: z.number() }) });

export function tokenSaved(): SQL {
  return sql`exists (select 1 from ${xApiSettings} where ${isNotNull(xApiSettings.sealedToken)})`;
}

export async function loadXApi({ db, secrets }: Readonly<XApiPorts>): Promise<XApiSaved> {
  const [row] = await db.select().from(xApiSettings).where(eq(xApiSettings.id, 1));

  if (row === undefined) return { auth: NONE, limits: DEFAULT_LIMITS };

  const limits = { itemLimitMicros: row.itemLimitMicros, dayLimitMicros: row.dayLimitMicros };

  if (row.sealedToken === null) return { auth: NONE, limits };

  const token = secrets === null ? null : await secrets.open(row.sealedToken);

  return { auth: token === null ? { kind: "unreadable" } : { kind: "token", token }, limits };
}

function stateOf(auth: Readonly<XApiAuth>): XApiTokenState {
  switch (auth.kind) {
    case "none":
      return "none";
    case "token":
      return "saved";
    case "unreadable":
      return "unreadable";
    default: {
      const exhaustive: never = auth;

      return exhaustive;
    }
  }
}

export async function xApiTokenState(ports: Readonly<XApiPorts>): Promise<XApiTokenState> {
  return stateOf((await loadXApi(ports)).auth);
}

export async function readXApiSettings(ports: Readonly<XApiPorts>): Promise<XApiSettingsView> {
  const [{ auth, limits }, today] = await Promise.all([
    loadXApi(ports),
    spentOn(ports.db, utcDayOf(Date.now())),
  ]);

  return { token: stateOf(auth), secretReady: ports.secrets !== null, ...limits, today };
}

export async function saveXApiToken(
  ports: Readonly<XApiPorts>,
  { token }: Readonly<XApiTokenInput>,
): Promise<XApiSettingsView | XApiRefused> {
  if (ports.secrets === null) return refusedXApi("secret-missing");

  const sealedToken = await ports.secrets.seal(token);

  await ports.db
    .insert(xApiSettings)
    .values({ id: 1, sealedToken })
    .onConflictDoUpdate({ target: xApiSettings.id, set: { sealedToken } });

  return readXApiSettings(ports);
}

export async function removeXApiToken(ports: Readonly<XApiPorts>): Promise<XApiSettingsView> {
  await ports.db.update(xApiSettings).set({ sealedToken: null }).where(eq(xApiSettings.id, 1));

  return readXApiSettings(ports);
}

export async function saveXApiLimits(
  ports: Readonly<XApiPorts>,
  limits: Readonly<XApiLimits>,
): Promise<XApiSettingsView> {
  await ports.db
    .insert(xApiSettings)
    .values({ id: 1, sealedToken: null, ...limits })
    .onConflictDoUpdate({ target: xApiSettings.id, set: { ...limits } });

  return readXApiSettings(ports);
}

export async function verifyXApiToken(
  ports: Readonly<VerifyPorts>,
  signal: AbortSignal,
): Promise<XApiVerifyResult> {
  if (ports.secrets === null) return refusedXApi("secret-missing");

  const { auth } = await loadXApi(ports);

  if (auth.kind === "none") return refusedXApi("not-configured");

  if (auth.kind === "unreadable") return refusedXApi("secret-missing");

  const { answer } = await xApiGet({
    origin: ports.config.xApiOrigin,
    token: auth.token,
    path: "/2/usage/credits",
    signal,
  });

  if (answer.kind === "limited") return refusedXApi("api-rate-limited", null);

  if (answer.kind === "refused") return refusedXApi(answer.reason, answer.status);

  const credits = parsedJson(CreditsSchema, answer.text);

  return credits === null
    ? refusedXApi("api-answer-refused")
    : { kind: "verified", balanceUsd: credits.data.total_balance };
}
