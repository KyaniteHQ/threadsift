---
name: typescript-best-practices
description: TypeScript best practices. Use when reading or editing any .ts or .tsx file.
paths: ["**/*.ts", "**/*.tsx"]
---

# TypeScript best practices

Apply the Type System Discipline and Boundary Discipline sections of the `ub-mode` skill first.

| Rule | Summary |
|------|---------|
| Discriminated unions | Model variants with a `kind` literal discriminant so impossible states can't be represented. No optional-field bags. |
| Branded types | Brand primitives with `& { readonly __brand: "X" }` so they can't be mixed up. Validate once at the boundary. A brand comes from a verifying type guard (`input is AgentId`), never from `as`. |
| Constructive modeling | Build the shape so the illegal value can't be constructed. `readonly [T, ...T[]]` for non-empty, `readonly (readonly [T, T])[]` for even length, `start` plus a `duration` the boundary schema keeps non-negative for a range. Not a runtime guard, not a wish for refinement types. |
| Simplest total type | Keep `readonly T[]` while every operation on it stays total. Strengthen to `NonEmpty<T>` only where the loose type forces `!`, a cast, or a "should never happen" throw. |
| `unknown` over `any` | External data is `unknown` until its schema parses it where it enters. No function takes an `unknown` parameter: lint allows one only as a type-guard subject or a `cause`. |
| Schemas before guards | Before hand-writing a property-by-property type guard, use the repository's runtime schema library and infer the type from the schema, such as `z.infer`. |
| No `as` casts | Every `as` is a runtime crash waiting. Here lint refuses every `as` except `as const` (`typescript/consistent-type-assertions` set to `never`), so narrow with a schema, a guard, or `satisfies`. |
| Narrowing hierarchy | Discriminant switch > `in` operator > `instanceof` > schema parse > user-defined type guard. Lint refuses `typeof` checks and `as`, so neither is on the list. |
| Readonly parameters | Lint wants every parameter deeply readonly (`typescript/prefer-readonly-parameter-types`): `readonly T[]`, `readonly` tuples, and `readonly` on each field of a type a function takes. |
| Type guards | Must verify the claim. A lying guard is worse than `as` because the bug hides behind a name that says it's safe. Name them `isX` or `hasX`. |
| Exhaustiveness | Inline `const exhaustive: never = x;` in default arms so the compiler errors when a new variant is added. |
| `satisfies` over `as` | Validates the value without widening literal types. |
| Boundary validation | Parse where data crosses in, into a named domain type. `Record<string, unknown>` (however spelled) stops at that parse. Trust types inside. |
| Schema-derived types | Reach for `Pick`/`Omit`/`Parameters`/`ReturnType`/`Awaited`/`typeof` before declaring a new interface. |
| Object args | Pass objects, not positional, so argument order is self-documenting. Skip on hot paths (per-frame render, tokenizers, parsers). |
| Real tests | `docs/testing.md` governs: no mocks, stubs, fakes or recordings, and UI is verified in a running build. |

Examples: `references/patterns.md`.
