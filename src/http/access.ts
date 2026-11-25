import type { OpenAPIHono } from "@hono/zod-openapi";
import type { MiddlewareHandler, Next } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";
import type { BlankEnv, Env, H } from "hono/types";

import type { Scope } from "../core/contract/agent-token-contract.ts";
import { byteSize } from "../core/contract/format.ts";
import {
  BODY_LIMIT_BYTES,
  ITEM_REQUEST_BYTES,
  RESTORE_PART_BYTES,
  RESULT_BODY_BYTES,
} from "../core/contract/limits.ts";
import type { Ports } from "../core/kernel/ports.ts";
import { type CallbackEnv, type Ctx, type OriginCheck, type Plan, admit } from "./access-steps.ts";
import { answerFailure } from "./refusals.ts";
import { type CacheKind, applyCache } from "./response-headers.ts";
import { callbackTask } from "./task-credential.ts";
import { unroutedPlan } from "./unrouted.ts";

declare module "hono" {
  interface ContextVariableMap {
    ports: Ports;
  }
}

interface Cap {
  readonly bytes: number;
  readonly label: string;
}

function sizedCap(bytes: number): Cap {
  return { bytes, label: byteSize(bytes) };
}

const DEFAULT_CAP = sizedCap(BODY_LIMIT_BYTES);

export const ITEM_CAP = sizedCap(ITEM_REQUEST_BYTES);

export const RESULT_CAP = sizedCap(RESULT_BODY_BYTES);

export const PART_CAP: Cap = { bytes: RESTORE_PART_BYTES, label: "the part size" };

function tooLarge({ label }: Readonly<Cap>): string {
  return `The request body is larger than ${label}`;
}

function capOf(cap: Readonly<Cap>): MiddlewareHandler {
  return bodyLimit({
    maxSize: cap.bytes,
    onError: (c) => c.json({ error: tooLarge(cap) }, 413),
  });
}

type Who = "owner" | "anyone" | "callback" | "self" | Scope;

interface Limits {
  readonly body?: Cap;
  readonly cache?: CacheKind;
  readonly signedOutNavigation?: string;
}

export type Gate<E extends object, W extends string> = MiddlewareHandler<E> & {
  readonly who: W;
};

const GATES = new WeakMap<object, string>();

const CAPS = new WeakMap<object, Cap>();

const CACHES = new WeakMap<object, CacheKind>();

const PORTS = new WeakSet<object>();

function originCheck(who: string): OriginCheck {
  if (who === "self" || who === "unrouted") return "none";

  return who === "anyone" || who === "callback" ? "always" : "unless-authorization";
}

export function originCheckOf(handler: H): OriginCheck {
  const who = GATES.get(handler);

  return who === undefined ? "none" : originCheck(who);
}

function planOf(c: Ctx, who: Who, cache: CacheKind | null): Plan {
  const csrf = originCheck(who);

  if (who === "self") return { credentials: null, csrf, after: "next", cache };

  if (who === "callback") return { credentials: null, csrf, after: "credential", cache };

  return { credentials: who === "anyone" ? null : who, csrf, after: "next", cache };
}

async function lookup(c: Ctx) {
  try {
    return await callbackTask(c);
  } catch (error) {
    if (error instanceof Error) return answerFailure(error, c);

    throw error;
  }
}

async function proceed(c: Ctx, plan: Readonly<Plan>, next: Next): Promise<void> {
  if (plan.after === "next") {
    await next();

    return;
  }

  const task = await lookup(c);

  if (task instanceof Response) {
    c.res = task;

    return;
  }

  c.set("callbackTask", task);
  await next();
}

async function answerOf(
  c: Ctx,
  plan: Readonly<Plan>,
  cap: MiddlewareHandler,
  next: Next,
): Promise<Response | undefined> {
  try {
    const refusal = await admit(c, plan);

    if (refusal !== undefined) return refusal;

    const capped = await cap(c, () => proceed(c, plan, next));

    return capped instanceof Response ? capped : undefined;
  } catch (error) {
    if (error instanceof Error) return answerFailure(error, c);

    throw error;
  }
}

function signedOutAnswer(
  c: Ctx,
  answer: Response | undefined,
  address: string | undefined,
): Response | undefined {
  const navigating =
    address !== undefined &&
    answer?.status === 401 &&
    c.req.method === "GET" &&
    c.req.header("authorization") === undefined &&
    c.req.header("sec-fetch-mode") === "navigate";

  return navigating ? new Response(null, { status: 303, headers: { location: address } }) : answer;
}

function gated<E extends Env>(
  who: string,
  body: Cap,
  planAt: (c: Ctx) => Plan,
  signedOutNavigation?: string,
): MiddlewareHandler<E> {
  const cap = capOf(body);

  const middleware = createMiddleware<E>(async (c, next) => {
    const plan = planAt(c);
    const answer = signedOutAnswer(c, await answerOf(c, plan, cap, next), signedOutNavigation);

    applyCache(answer ?? c.res, plan.cache);

    return answer;
  });

  GATES.set(middleware, who);
  CAPS.set(middleware, body);

  return middleware;
}

function gateOf<E extends Env, W extends Who>(
  who: W,
  { body = DEFAULT_CAP, cache, signedOutNavigation }: Limits,
): Gate<E, W> {
  const middleware = gated<E>(who, body, (c) => planOf(c, who, cache ?? null), signedOutNavigation);

  if (cache !== undefined) CACHES.set(middleware, cache);

  return Object.assign(middleware, { who });
}

export function access(who: "callback", limits?: Limits): Gate<CallbackEnv, "callback">;
export function access<W extends Exclude<Who, "callback">>(
  who: W,
  limits?: Limits,
): Gate<BlankEnv, W>;
export function access(who: Who, limits: Limits = {}) {
  return who === "callback"
    ? gateOf<CallbackEnv, "callback">(who, limits)
    : gateOf<BlankEnv, Exclude<Who, "callback">>(who, limits);
}

function routeCacheAt(
  app: OpenAPIHono,
  methods: readonly string[],
  path: string,
): CacheKind | null {
  for (const method of methods) {
    for (const [[handler]] of app.router.match(method, path)[0]) {
      const kind = CACHES.get(handler);

      if (kind !== undefined) return kind;
    }
  }

  return null;
}

export function unrouted(app: OpenAPIHono): Gate<BlankEnv, "unrouted"> {
  let methods: readonly string[] | undefined;

  const middleware = gated<BlankEnv>("unrouted", DEFAULT_CAP, (c) =>
    unroutedPlan(c.req.path, (path) => {
      methods ??= [...new Set(app.routes.map((route) => route.method))];

      return routeCacheAt(app, methods, path);
    }),
  );

  return Object.assign(middleware, { who: "unrouted" as const });
}

export function ownCheck<E extends Env>(check: MiddlewareHandler<E>): Gate<E, "self"> {
  const middleware = createMiddleware<E>((c, next) => check(c, next));

  GATES.set(middleware, "self");

  return Object.assign(middleware, { who: "self" as const });
}

export function withPorts(ports: Ports): MiddlewareHandler {
  const middleware = createMiddleware(async (c, next) => {
    c.set("ports", ports);

    await next();
  });

  PORTS.add(middleware);

  return middleware;
}

export function whoOf(handler: H): string | undefined {
  return GATES.get(handler);
}

export function tooLargeOf(handler: H): string | undefined {
  const cap = CAPS.get(handler);

  return cap === undefined ? undefined : tooLarge(cap);
}

export function holdsPorts(handler: H): boolean {
  return PORTS.has(handler);
}
