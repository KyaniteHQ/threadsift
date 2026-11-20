import type { MiddlewareHandler, Next } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";
import type { BlankEnv, Env, H } from "hono/types";

import type { Scope } from "../core/kinds.ts";
import {
  BODY_LIMIT_BYTES,
  ITEM_REQUEST_BYTES,
  RESTORE_PART_BYTES,
  RESULT_BODY_BYTES,
} from "../core/limits.ts";
import type { Ports } from "../core/ports.ts";
import { type CallbackEnv, type Ctx, type Plan, admit } from "./access-steps.ts";
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

const DEFAULT_CAP: Cap = { bytes: BODY_LIMIT_BYTES, label: "64 KiB" };

export const ITEM_CAP: Cap = { bytes: ITEM_REQUEST_BYTES, label: "8 MiB" };

export const RESULT_CAP: Cap = { bytes: RESULT_BODY_BYTES, label: "256 KiB" };

export const PART_CAP: Cap = { bytes: RESTORE_PART_BYTES, label: "the part size" };

function capOf({ bytes, label }: Readonly<Cap>): MiddlewareHandler {
  return bodyLimit({
    maxSize: bytes,
    onError: (c) => c.json({ error: `The request body is larger than ${label}` }, 413),
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

const PORTS = new WeakSet<object>();

function planOf(c: Ctx, who: Who | "unrouted", cache: CacheKind | null): Plan {
  if (who === "unrouted") return unroutedPlan(c);

  if (who === "self") return { credentials: null, csrf: false, after: "next", cache };

  const after = who === "callback" ? "credential" : "next";
  const open = who === "anyone" || who === "callback";

  return {
    credentials: open ? (c.req.method === "HEAD" ? "read" : null) : who,
    csrf: true,
    after,
    cache,
  };
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
    applyCache(task, plan.cache);
    c.res = task;

    return;
  }

  c.set("callbackTask", task);
  await next();
  applyCache(c.res, plan.cache);
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

function gateOf<E extends Env, W extends Who | "unrouted">(
  who: W,
  { body = DEFAULT_CAP, cache, signedOutNavigation }: Limits,
): Gate<E, W> {
  const cap = capOf(body);

  const middleware = createMiddleware<E>(async (c, next) => {
    const plan = planOf(c, who, cache ?? null);
    const answer = signedOutAnswer(c, await answerOf(c, plan, cap, next), signedOutNavigation);

    if (plan.cache !== null && plan.after !== "credential") applyCache(answer ?? c.res, plan.cache);

    return answer;
  });

  GATES.set(middleware, who);

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

export function unrouted(): Gate<BlankEnv, "unrouted"> {
  return gateOf<BlankEnv, "unrouted">("unrouted", {});
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

export function holdsPorts(handler: H): boolean {
  return PORTS.has(handler);
}
