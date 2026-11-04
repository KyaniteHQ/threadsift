# TypeScript patterns

Code examples for each rule in `SKILL.md`. The underlying principles are language-agnostic. The Type System Discipline and Boundary Discipline sections of the `ub-mode` skill hold the principles.

The "Do" examples pass this repository's lint, which wants every parameter deeply readonly (`typescript/prefer-readonly-parameter-types`), so arrays, tuples and the fields of types a function takes are `readonly`.

## Branded types

Brand primitives so they can't be mixed up. Validate once at the boundary. Downstream code trusts the type.

```ts
type AgentId = string & { readonly __brand: "AgentId" };

function isAgentId(input: string): input is AgentId {
  return isUUID(input);
}

function parseAgentId(input: string): AgentId {
  if (!isAgentId(input)) throw new Error(`Invalid agent id: ${input}`);

  return input;
}

function focusAgent(id: AgentId): void {
  focusPane(id);
}
```

Match the `readonly __brand: 'X'` shape. Don't invent a new convention.

## Discriminated unions

Model variants with a literal discriminant. Every variant shares the field name and each variant's value is unique, so impossible combos can't be represented.

```ts
// Don't. Boolean + optionals lets contradictory states exist.
type DiffState = { loading: boolean; diff?: GitDiff; error?: string };

// Do. Only valid states exist.
type DiffState =
  | { kind: "loading" }
  | { kind: "ready"; diff: GitDiff }
  | { kind: "error"; error: string };
```

Pick one discriminant name (`kind`, `type`, `tag`) and stick to it.

## Constructive modeling

Build the type from parts that are all legal instead of restricting a loose type with runtime checks.

Non-empty, via a variadic tuple:

```ts
type NonEmpty<T> = readonly [T, ...T[]];

// Don't: an array plus a length check every caller must repeat
function pickWinner(entries: readonly string[]): string {
  if (entries.length === 0) throw new Error("no entries");
  return entries[Math.floor(Math.random() * entries.length)];
}

// Do: an empty value of the type can't exist
function pickWinner(entries: NonEmpty<string>): string {
  return entries[Math.floor(Math.random() * entries.length)];
}
```

Where a plain array arrives, narrow once with a guard. The fact then travels in the type:

```ts
const isNonEmpty = <T>(arr: readonly T[]): arr is NonEmpty<T> => arr.length > 0;
```

Even length, as pairs:

```ts
type Pairs<T> = readonly (readonly [T, T])[];
```

A time range, as start plus duration:

```ts
// Don't: a comment holds the invariant
type TimeRange = { start: Date; end: Date }; // start <= end

// Do: one invariant on one field instead of a relation between two; derive end when needed
type TimeRange = { readonly start: Date; readonly durationMs: number };
```

A negative `durationMs` still type-checks, so the schema that parses the range where it enters refuses it (`z.number().nonnegative()`). Keep `durationMs` a plain number inside. Brand it (per Branded types) only if a raw number could be passed where a duration is expected, not by reflex. Pick the representation that makes the bad state unconstructable, then expose the reading you need on top (`pairs.flat()`, a `rangeEnd()` helper).

## Simplest total type

Don't strengthen everything. Keep `readonly T[]` when every operation on it is total, as `sum([])` is 0:

```ts
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
```

Strengthen when the loose type forces a lie at a use site. The tells are `!`, `arr[0] as T`, and a "should never happen" throw:

```ts
// Don't: partiality smuggled past the compiler
function newestSession(sessions: readonly Session[]): Session {
  return sessions.at(0)!;
}

// Do: strengthen the input; the assertion disappears
function newestSession(sessions: NonEmpty<Session>): Session {
  return sessions[0];
}
```

Weakening the result to `Session | undefined` is the other total signature.

## `unknown` over `any`

External data is `unknown` until its schema parses it, where it enters. No function takes an `unknown` parameter: lint allows one only as the subject of a type guard or as a `cause` (`anti-slop/no-unknown-parameters`), and refuses `typeof` checks (`anti-slop/no-runtime-typeof`).

```ts
import { z } from "zod";

// Don't
function handle(input: any) {
  return input.foo.bar;
}

// Do: parse where the data enters; the function takes the parsed type
const payloadSchema = z.object({ foo: z.object({ bar: z.string() }).readonly() }).readonly();

type Payload = z.infer<typeof payloadSchema>;

function handle(payload: Payload): string {
  return payload.foo.bar;
}

handle(payloadSchema.parse(JSON.parse(body)));
```

External sources include RPC payloads, `JSON.parse`, `postMessage`, IPC, file contents, environment variables, database results.

## Schemas before hand-rolled guards

Before writing a property-by-property type guard for external data, look for the repository's runtime schema library and existing schemas. Let one schema own validation and derive the TypeScript type from it. Do not maintain a schema, a duplicate interface, and a guard that can drift apart.

```ts
import { z } from "zod";

const UserSchema = z.object({
  id: z.uuid(),
  role: z.enum(["admin", "member"]),
});

type User = z.infer<typeof UserSchema>;

const user: User = UserSchema.parse(JSON.parse(body));
```

Use `safeParse` when failure is an expected branch. Use the equivalent inference helper when the repository uses another schema library. Do not add a new schema dependency for one guard. This rule prefers the schema system the codebase already trusts.

## No `as` casts

Every `as` is a potential runtime crash. In this repository lint refuses every `as` except `as const`, so the fixes below are the only way out.

```ts
import { z } from "zod";

// Don't
const user = data as User;

// Don't
function isUser(data: unknown): data is User {
  return typeof data === "object" && data !== null && "id" in data;
}

// Do
const userSchema = z.object({ id: z.string(), name: z.string() });
type User = z.infer<typeof userSchema>;

const user: User = userSchema.parse(data);
```

When the type comes first, annotate the validator with the type it proves. The compiler then rejects a validator that proves less than the type. Remove `name` from the object below and the assignment fails to compile.

```ts
type User = { id: string; name: string };

const userSchema: z.ZodType<User> = z.object({ id: z.string(), name: z.string() });
```

When refactoring an `as` out of existing code, identify why TypeScript can't infer:

- Missing discriminant: add one, switch to a discriminated union.
- Overly wide source type (e.g. `Record<string, unknown>`): narrow it.
- Untyped boundary: parse with the schema that owns the shape. Add a schema only where none exists.
- Genuinely inexpressible: use a branded type or `satisfies`.

## Narrowing hierarchy

From best to last-resort:

1. **Discriminated union switch / if.** Compiler narrows automatically.
2. **`in` operator.** `"key" in obj` narrows to variants containing that key.
3. **`instanceof`.** For class instances.
4. **Schema parse.** For data from outside, where it enters.
5. **User-defined type guard.** When the above aren't enough.

Lint refuses `typeof` checks and every `as` except `as const`, so neither is on the list.

```ts
type Figure =
  | { readonly kind: "circle"; readonly radius: number }
  | { readonly kind: "rect"; readonly width: number; readonly height: number };

function area(s: Figure): number {
  if ("radius" in s) return Math.PI * s.radius ** 2;

  return s.width * s.height;
}
```

The `in` check narrows `s` to the circle, so the last line sees only the rect.

## Type guards

A guard must actually verify the claim. A lying guard is worse than `as`.

```ts
function isCircle(s: Figure): s is Figure & { kind: "circle" } {
  return s.kind === "circle";
}
```

Prefer discriminant narrowing when possible.

## Exhaustiveness

In default arms, assign the discriminant to a `never`-typed local.

```ts
// Value-returning switch
function area(s: Figure): number {
  switch (s.kind) {
    case "circle":
      return Math.PI * s.radius ** 2;
    case "rect":
      return s.width * s.height;
    default: {
      const exhaustive: never = s;

      return exhaustive;
    }
  }
}

// Void switch
function drawFigure(s: Figure): void {
  switch (s.kind) {
    case "circle":
      drawCircle(s);
      break;
    case "rect":
      drawRect(s);
      break;
    default: {
      const exhaustive: never = s;
      void exhaustive;
    }
  }
}
```

Return-style in value-returning switches, void-style in statement switches.

## `satisfies` over `as`

`satisfies` validates without widening literal types.

```ts
// Don't. Widens, loses literal types.
const config = { theme: "dark", cols: 3 } as Config;

// Do. Validates AND preserves literal types.
const config = { theme: "dark", cols: 3 } satisfies Config;
```

`config.theme` keeps the literal type `"dark"`, not `string`.

## Boundary validation

Validate once where data crosses in. Trust types inside. See the Boundary Discipline section of the `ub-mode` skill.

- **Wire formats** (proto, JSON-RPC): parse with `ignoreUnknownFields` so forward-compatible changes don't break old clients.
- **Persisted JSON:** versioned blob with a try/catch around the parse.
- **Don't re-validate** deep in call chains.

## Schema-derived types

When a `.proto`, OpenAPI spec, GraphQL schema, or database migration already defines a shape, derive from the generated types instead of duplicating them.

```ts
// Don't. Duplicate shape, drifts when the schema changes.
type CheckSummary = {
  totalCount: number;
  conclusion: string;
};
function renderChecks(s: CheckSummary): number {
  return s.totalCount;
}

// Do. Derive from the generated schema type.
import type { ChecksMessage } from "<generated module>";
function renderChecks(s: Readonly<Pick<ChecksMessage, "totalCount" | "conclusion">>): number {
  return s.totalCount;
}
```

Reach for `Pick`, `Omit`, `Parameters`, `ReturnType`, `Awaited`, `typeof` before writing a new interface.

## Object args

```ts
// Don't. Swap two args, still compiles.
openFile(uri, {
  startLineNumber: 10,
  startColumn: 1,
  endLineNumber: 10,
  endColumn: 1,
});

// Do. Order-independent, self-documenting.
openFile({
  uri,
  selection: {
    startLineNumber: 10,
    startColumn: 1,
    endLineNumber: 10,
    endColumn: 1,
  },
});
```

Skip on hot paths: per-frame render, tokenizers, parsers, anything in a tight loop where the allocation cost matters.
