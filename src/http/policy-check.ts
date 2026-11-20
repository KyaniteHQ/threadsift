import type { H, RouterRoute } from "hono/types";

import { SCOPES } from "../core/agent-token-contract.ts";
import { holdsPorts, whoOf } from "./access.ts";

const READ_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD"]);

function mismatch(method: string, who: string): string | null {
  if (!SCOPES.some((scope) => scope === who)) return null;

  const fits = method !== "ALL" && READ_METHODS.has(method) === (who === "read");

  return fits ? null : `${method} names the ${who} scope`;
}

function problemsOf(key: string, handlers: readonly H[]): string[] {
  const [first] = handlers;
  const method = key.slice(0, key.indexOf(" "));
  const wrong = handlers.flatMap((handler) => mismatch(method, whoOf(handler) ?? "") ?? []);

  return [
    ...(first === undefined || whoOf(first) === undefined
      ? [`${key} does not start with access(...)`]
      : []),
    ...wrong.map((text) => `${key}: ${text}`),
  ];
}

export function verifyPolicies(app: Readonly<{ routes: readonly Readonly<RouterRoute>[] }>): void {
  const [ports, ...entries] = app.routes;
  const groups = new Map<string, H[]>();

  for (const { method, path, handler } of entries) {
    if (holdsPorts(handler)) continue;

    const key = `${method} ${path}`;

    groups.set(key, [...(groups.get(key) ?? []), handler]);
  }

  const problems = [
    ...(ports !== undefined && holdsPorts(ports.handler) ? [] : ["withPorts(...) is not first"]),
    ...[...groups].flatMap(([key, handlers]) => problemsOf(key, handlers)),
  ];

  if (problems.length > 0) {
    throw new Error(`Route access is missing or does not fit its method: ${problems.join(", ")}`);
  }
}
