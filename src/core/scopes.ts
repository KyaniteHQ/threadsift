import type { Scope } from "./kinds.ts";

export type NeededScopes = readonly [Scope, ...Scope[]];

export function missingScope(granted: readonly string[], needed: NeededScopes): Scope | undefined {
  return needed.find((scope) => !granted.includes(scope));
}

export function pasteScopes(sendsDigest: boolean): NeededScopes {
  return sendsDigest ? ["add", "digest"] : ["add"];
}

export function lacksScope(scope: Scope): string {
  return `This agent token lacks the ${scope} scope`;
}
