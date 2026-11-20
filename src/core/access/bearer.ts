import type { Ports } from "../kernel/ports.ts";
import { type VerifiedToken, verifyToken } from "./tokens.ts";

const SCHEME = "bearer";

const TOKEN_CHARACTERS = /^[A-Za-z0-9._~+/-]+=*$/u;

const EXACT = /^Bearer (\S+)$/u;

type Grammar = "rest" | "callback";

type Bearer =
  | { readonly kind: "empty" | "malformed" }
  | { readonly kind: "token"; readonly value: string };

export type PresentedToken =
  | { readonly kind: "empty" | "malformed" | "unknown" }
  | { readonly kind: "token"; readonly token: VerifiedToken; readonly value: string };

function laxValue(authorization: string): string | undefined {
  const value =
    authorization.toLowerCase().startsWith(SCHEME) && authorization[SCHEME.length] === " "
      ? authorization.slice(SCHEME.length).trimStart()
      : "";

  return TOKEN_CHARACTERS.test(value) ? value : undefined;
}

export function bearerOf(authorization: string, grammar: Grammar = "rest"): Bearer {
  if (authorization === "") return { kind: "empty" };

  const value = grammar === "callback" ? EXACT.exec(authorization)?.[1] : laxValue(authorization);

  return value === undefined ? { kind: "malformed" } : { kind: "token", value };
}

export async function presentedToken(
  ports: Ports,
  authorization: string,
  grammar: Grammar = "rest",
): Promise<PresentedToken> {
  const bearer = bearerOf(authorization, grammar);

  if (bearer.kind !== "token") return bearer;

  const token = await verifyToken(ports, bearer.value);

  return token === undefined ? { kind: "unknown" } : { kind: "token", token, value: bearer.value };
}
