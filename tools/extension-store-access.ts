import { createHmac, createSign, randomUUID } from "node:crypto";

import { z } from "zod";

import { ReleaseError } from "./release-versions.ts";

const ENVIRONMENT = "extension-stores";
const STORE_CALL_DEADLINE_MS = 30_000;
const JWT_SECONDS = 60;
const CHROME_READ_SCOPE = "https://www.googleapis.com/auth/chromewebstore.readonly";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export const ACCESS_NAMES = {
  chromePublisher: "CHROME_PUBLISHER_ID",
  chromeExtension: "CHROME_EXTENSION_ID",
  chromeToken: "CHROME_SERVICE_ACCOUNT_ACCESS_TOKEN",
  chromeEmail: "CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL",
  chromeKey: "CHROME_SERVICE_ACCOUNT_PRIVATE_KEY",
  firefoxExtension: "FIREFOX_EXTENSION_ID",
  firefoxIssuer: "FIREFOX_JWT_ISSUER",
  firefoxSecret: "FIREFOX_JWT_SECRET",
} as const;

export type ChromeSignIn =
  | { readonly kind: "token"; readonly token: string }
  | { readonly kind: "key"; readonly email: string; readonly key: string };

export interface StoreAccess {
  readonly chromePublisher: string;
  readonly chromeExtension: string;
  readonly chromeSignIn: ChromeSignIn;
  readonly firefoxExtension: string;
  readonly firefoxIssuer: string;
  readonly firefoxSecret: string;
}

export interface StoreCall {
  readonly store: string;
  readonly url: string;
  readonly method?: "GET" | "POST";
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
}

const GoogleTokenSchema = z.object({ access_token: z.string().min(1) });

const named = z.preprocess((value) => (value === "" ? undefined : value), z.string().trim().min(1));

const StoresEnvSchema = z.object({
  [ACCESS_NAMES.chromePublisher]: named,
  [ACCESS_NAMES.chromeExtension]: named,
  [ACCESS_NAMES.firefoxExtension]: named,
  [ACCESS_NAMES.firefoxIssuer]: named,
  [ACCESS_NAMES.firefoxSecret]: named,
});

const ChromeSignInSchema = z.union([
  z
    .object({ [ACCESS_NAMES.chromeToken]: named })
    .transform((env): ChromeSignIn => ({ kind: "token", token: env[ACCESS_NAMES.chromeToken] })),
  z
    .object({ [ACCESS_NAMES.chromeEmail]: named, [ACCESS_NAMES.chromeKey]: named })
    .transform((env): ChromeSignIn => ({
      kind: "key",
      email: env[ACCESS_NAMES.chromeEmail],
      key: env[ACCESS_NAMES.chromeKey],
    })),
]);

const CHROME_SIGN_IN_NAMES = `${ACCESS_NAMES.chromeToken} (the Google sign-in step sets it from GCP_WORKLOAD_IDENTITY_PROVIDER and CHROME_SERVICE_ACCOUNT_EMAIL), or both ${ACCESS_NAMES.chromeEmail} and ${ACCESS_NAMES.chromeKey}`;

export function storeAccess(): StoreAccess {
  const stores = StoresEnvSchema.safeParse(process.env);
  const chrome = ChromeSignInSchema.safeParse(process.env);
  if (!stores.success || !chrome.success) {
    const missing = [
      ...(stores.success ? [] : stores.error.issues.map((issue) => String(issue.path[0]))),
      ...(chrome.success ? [] : [CHROME_SIGN_IN_NAMES]),
    ];
    throw new ReleaseError(
      `sign-in: the ${ENVIRONMENT} environment does not give ${missing.join("; ")}`,
    );
  }
  return {
    chromePublisher: stores.data[ACCESS_NAMES.chromePublisher],
    chromeExtension: stores.data[ACCESS_NAMES.chromeExtension],
    chromeSignIn: chrome.data,
    firefoxExtension: stores.data[ACCESS_NAMES.firefoxExtension],
    firefoxIssuer: stores.data[ACCESS_NAMES.firefoxIssuer],
    firefoxSecret: stores.data[ACCESS_NAMES.firefoxSecret],
  };
}

function encodedJwt(
  header: Readonly<Record<string, string>>,
  claims: Readonly<Record<string, number | string>>,
  sign: (input: string) => string,
): string {
  const input = [header, claims]
    .map((part) => Buffer.from(JSON.stringify(part)).toString("base64url"))
    .join(".");
  return `${input}.${sign(input)}`;
}

function issuedNow() {
  const iat = Math.floor(Date.now() / 1000);
  return { iat, exp: iat + JWT_SECONDS };
}

export function firefoxAuthorization(access: Readonly<StoreAccess>): string {
  const token = encodedJwt(
    { alg: "HS256", typ: "JWT" },
    { iss: access.firefoxIssuer, jti: randomUUID(), ...issuedNow() },
    (input) => createHmac("sha256", access.firefoxSecret).update(input).digest("base64url"),
  );
  return `JWT ${token}`;
}

async function answered(call: Readonly<StoreCall>): Promise<Response | undefined> {
  const method = call.method ?? "GET";
  const response = await fetch(call.url, {
    method,
    headers: call.headers,
    body: call.body ?? null,
    redirect: "error",
    signal: AbortSignal.timeout(STORE_CALL_DEADLINE_MS),
  });
  if (response.status === 404) return undefined;
  if (!response.ok) {
    const body = (await response.text()).slice(0, 300);
    throw new ReleaseError(
      `${call.store}: ${method} ${new URL(call.url).pathname} answered ${String(response.status)}: ${body}`,
    );
  }
  return response;
}

export async function found<T>(
  call: Readonly<StoreCall>,
  schema: z.ZodType<T>,
): Promise<T | undefined> {
  const response = await answered(call);
  return response === undefined ? undefined : schema.parse(await response.json());
}

export async function present<T>(call: Readonly<StoreCall>, schema: z.ZodType<T>): Promise<T> {
  const value = await found(call, schema);
  if (value === undefined) {
    throw new ReleaseError(`${call.store}: ${new URL(call.url).pathname} answered 404`);
  }
  return value;
}

export async function chromeAuthorization(account: ChromeSignIn): Promise<string> {
  if (account.kind === "token") return `Bearer ${account.token}`;
  const assertion = encodedJwt(
    { alg: "RS256", typ: "JWT" },
    { iss: account.email, scope: CHROME_READ_SCOPE, aud: GOOGLE_TOKEN_URL, ...issuedNow() },
    (input) => createSign("RSA-SHA256").update(input).sign(account.key, "base64url"),
  );
  const token = await present(
    {
      store: "Google sign-in",
      url: GOOGLE_TOKEN_URL,
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
    },
    GoogleTokenSchema,
  );
  return `Bearer ${token.access_token}`;
}
